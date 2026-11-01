"""FastAPI 앱. 화면은 /api/* 만 호출한다. 사용자별 자료 접근은 서버에서 권한을 검사한다."""

from __future__ import annotations

if __name__ == "__main__":  # 직접 실행하면 아래 상대 import가 실패하므로 안내만 하고 끝낸다
    raise SystemExit("app/main.py 는 직접 실행하지 않습니다. 대신:  backend/.venv/bin/python backend/run.py")

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import ValidationError

from . import analyses, auth, db as dbm, google_oauth, pricewatch, property as prop, push
from .clock import now_iso
from .schemas import (
    Answers, CreateAnalysis, Credentials, Evidence, LookupRequest, UpdateAnalysis,
)
from .settings import settings

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)  # 요청 주소(인증키 포함)를 로그에 남기지 않음
logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    dbm.connect().close()  # 마이그레이션
    pricewatch.start_scheduler()  # 관심자산 예상 가격 매주 확인
    yield


app = FastAPI(title="부산 빈집 처리 비교 API", version="2.0", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_error(_: Request, e: HTTPException):
    return JSONResponse({"error": e.detail}, status_code=e.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError):
    first = e.errors()[0] if e.errors() else {}
    where = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse({"error": f"입력값을 확인해 주세요({where}): {str(first.get('msg', '')).removeprefix('Value error, ')}"}, 400)


# ---------------------------------------------------------------- 사용자 식별
def user_of(request: Request) -> dict | None:
    return auth.current_user(request.cookies.get(auth.SESSION_COOKIE))


def guest_of(request: Request) -> str | None:
    return request.cookies.get(auth.GUEST_COOKIE)


def require_user(request: Request) -> dict:
    u = user_of(request)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다.")
    return u


def _cookie(resp: Response, name: str, value: str, days: int):
    resp.set_cookie(name, value, max_age=days * 86400, httponly=True, samesite="lax",
                    secure=settings.frontend_origin.startswith("https"))


# ---------------------------------------------------------------- 기본
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(settings.frontend_origin)


@app.get("/api/status")
def status():
    return {"juso": bool(settings.juso_key), "dataGoKr": bool(settings.data_go_kr_key), "vworld": bool(settings.vworld_key),
            "llm": bool(settings.anthropic_api_key)}


# ---------------------------------------------------------------- 회원
@app.post("/api/auth/signup")
def signup(body: Credentials):
    try:
        return auth.signup(body.email, body.password)
    except auth.AuthError as e:
        raise HTTPException(400, str(e))


@app.post("/api/auth/login")
def login(body: Credentials, response: Response):
    try:
        token = auth.login(body.email, body.password)
    except auth.AuthError as e:
        raise HTTPException(401, str(e))
    _cookie(response, auth.SESSION_COOKIE, token, auth.SESSION_DAYS)
    return {"ok": True}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    auth.logout(request.cookies.get(auth.SESSION_COOKIE))
    response.delete_cookie(auth.SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/auth/google/start")
def google_start(next: str | None = None):
    if not google_oauth.configured():
        return RedirectResponse(f"{settings.frontend_origin}/login?error=google_not_configured", status_code=302)
    url, state = google_oauth.start(next)
    resp = RedirectResponse(url, status_code=302)
    resp.set_cookie(google_oauth.STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax",
                    secure=settings.frontend_origin.startswith("https"))
    return resp


@app.get("/api/auth/google/callback")
def google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    fail = f"{settings.frontend_origin}/login?error="
    if error or not code:
        return RedirectResponse(fail + "google_cancelled", status_code=302)
    try:
        email, sub, next_path = google_oauth.finish(code, state or "", request.cookies.get(google_oauth.STATE_COOKIE))
    except google_oauth.GoogleError:
        return RedirectResponse(fail + "google_failed", status_code=302)
    resp = RedirectResponse(f"{settings.frontend_origin}{next_path}", status_code=302)
    _cookie(resp, auth.SESSION_COOKIE, auth.google_login(email, sub), auth.SESSION_DAYS)
    resp.delete_cookie(google_oauth.STATE_COOKIE)
    return resp


@app.get("/api/auth/config")
def auth_config():
    return {"google": google_oauth.configured()}


@app.get("/api/auth/me")
def me(request: Request):
    return {"user": user_of(request)}


# ---------------------------------------------------------------- 주소·공공자료
@app.get("/api/address")
async def address(mode: str = Query(pattern="^(live|sample)$"), q: str = Query(min_length=2, max_length=80)):
    if mode == "sample" and not settings.sample_mode:
        raise HTTPException(404, "예시 모드는 제공하지 않아요.")
    r = await prop.search(mode, q.strip())
    return JSONResponse(r, status_code=200 if r["ok"] else 502)


@app.post("/api/lookup")
async def lookup(body: LookupRequest):
    if body.mode == "sample" and not settings.sample_mode:
        raise HTTPException(404, "예시 모드는 제공하지 않아요.")
    try:
        return await prop.lookup(body.mode, body.address)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ---------------------------------------------------------------- 분석
def _wrap(fn):
    try:
        return fn()
    except analyses.NotFound as e:
        raise HTTPException(404, str(e))
    except analyses.AccessError as e:
        raise HTTPException(403, str(e))


@app.post("/api/analyses")
def create_analysis(body: CreateAnalysis, request: Request, response: Response):
    user, guest = user_of(request), guest_of(request)
    if not user and not guest:
        guest = secrets.token_urlsafe(24)
        _cookie(response, auth.GUEST_COOKIE, guest, 7)
    out = _wrap(lambda: analyses.create(body.lookupId, body.answers.model_dump(), body.scope.model_dump(), user, guest))
    return {**out, "loggedIn": bool(user)}


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str, request: Request):
    return _wrap(lambda: analyses.get(analysis_id, user_of(request), guest_of(request)))


_OFFICE_CACHE: dict[str, tuple[float, dict]] = {}


@app.get("/api/analyses/{analysis_id}/brokers")
async def nearby_brokers(analysis_id: str, request: Request):
    """매물을 내놓을 동네 공인중개사무소(국토부 등록 정보). 로그인 + 이 집을 관심자산에 등록한 경우만."""
    import time
    from .adapters import vworld
    u = require_user(request)
    with dbm.connect() as c:
        row = c.execute("SELECT a.lookup_id FROM analyses a JOIN watched_assets w ON w.asset_id = a.asset_id "
                        "WHERE a.id = ? AND w.user_id = ? AND w.deleted_at IS NULL", (analysis_id, u["id"])).fetchone()
    if not row:
        raise HTTPException(403, "관심자산에 등록한 집에서만 공인중개사를 연결할 수 있어요.")
    lk = prop.get_lookup(row["lookup_id"])
    sgg, dong = lk["pnu"][:5], lk["address"].get("emdNm") or ""
    hit = _OFFICE_CACHE.get(sgg)
    if not hit or time.time() - hit[0] > 86400:  # 하루 캐시
        hit = (time.time(), await vworld.offices(sgg))
        _OFFICE_CACHE[sgg] = hit
    res = hit[1]
    if not res["ok"]:
        raise HTTPException(502, res["error"]["message"])
    same = [o for o in res["data"] if dong and f" {dong} " in f" {o['jibunAddr'] or ''} "]
    others = [o for o in res["data"] if o not in same]
    same, others, local_note = await _enrich_offices(same[:20], others[:30], lk)
    return {"dong": dong, "sgg": lk["address"].get("sggNm"), "sameDong": same[:12], "nearby": others[:8],
            "total": len(res["data"]), "source": res["meta"]["source"], "asOf": res["meta"].get("fetchedAt"),
            "sortedBy": "distance" if any(o.get("distanceM") is not None for o in same + others) else "registry",
            "localNote": local_note}


_LOCAL_CACHE: dict[str, tuple[float, dict | None]] = {}


async def _enrich_offices(same: list[dict], others: list[dict], lk: dict) -> tuple[list[dict], list[dict], str | None]:
    """카카오 로컬로 전화번호·위치를 붙이고 집에서 가까운 순으로 정렬. 키가 없거나 꺼져 있으면 그대로 돌려준다."""
    import asyncio
    import time
    import httpx
    from .adapters import kakao_local as kl
    if not kl.configured():
        return same, others, "카카오 로컬 API 키가 없어 전화번호·거리를 표시하지 못했어요."
    sgg = lk["address"].get("sggNm") or ""
    try:
        async with httpx.AsyncClient() as client:
            home = await kl.geocode(client, lk["address"].get("roadAddr") or lk["address"].get("jibunAddr"))

            async def one(o):
                key = o["regNo"] + o["name"]
                hit = _LOCAL_CACHE.get(key)
                if not hit or time.time() - hit[0] > 7 * 86400:  # 1주 캐시
                    hit = (time.time(), await kl.find_office(client, o["name"], sgg, o.get("roadAddr"), o.get("jibunAddr")))
                    _LOCAL_CACHE[key] = hit
                info = hit[1] or {}
                d = kl.distance_m(home, (info["x"], info["y"])) if home and info.get("x") else None
                return o | {"phone": info.get("phone"), "placeUrl": info.get("placeUrl"), "distanceM": round(d) if d is not None else None}
            sem = asyncio.Semaphore(6)

            async def guarded(o):
                async with sem:
                    return await one(o)
            same = list(await asyncio.gather(*(guarded(o) for o in same)))
            others = list(await asyncio.gather(*(guarded(o) for o in others)))
    except kl.KakaoLocalError as e:
        return same, others, str(e)
    except httpx.HTTPError:
        return same, others, "카카오 로컬 API에 연결하지 못했어요."
    key = lambda o: (o.get("distanceM") is None, o.get("distanceM") or 0)  # 거리를 모르는 곳은 뒤로
    return sorted(same, key=key), sorted(others, key=key), None


EVIDENCE_FIELDS = ("H", "L", "M_H", "M_L", "period_H", "period_L")
COST_FIELDS = ("tax", "holding", "finance", "cleanup", "other")


def _ev(v) -> dict:
    return Evidence.model_validate(v).model_dump(exclude_none=True)


def validate_inputs(raw: dict) -> dict:
    out, field = {}, None
    try:
        for field, v in raw.items():
            if v is None:
                out[field] = None
            elif field in EVIDENCE_FIELDS:
                out[field] = _ev(v)
            elif field in ("C_H", "C_L"):
                out[field] = {k: _ev(x) for k, x in v.items() if k in COST_FIELDS and x}
            elif field == "D":
                d = {}
                if v.get("quote"):
                    d["quote"] = _ev(v["quote"])
                if v.get("simulation") and v["simulation"].get("unitPerPyeong"):
                    s = v["simulation"]
                    d["simulation"] = {"unitPerPyeong": float(s["unitPerPyeong"]), "multiplier": float(s.get("multiplier") or 1),
                                       "multiplierShare": min(1.0, max(0.0, float(s.get("multiplierShare") or 1)))}
                out[field] = d
            elif field == "funding":
                out[field] = {"prefund": v.get("prefund") if v.get("prefund") in ("yes", "no", "unknown") else "unknown",
                              "available": float(v["available"]) if v.get("available") not in (None, "") else None}
            elif field == "supports":
                keys = ("name", "programId", "confirmed", "confirmedAmount", "maxAmount", "type", "payment", "saleCompatible",
                        "noDuplicationConfirmed")
                out[field] = [{k: s.get(k) for k in keys} for s in v][:10]
            elif field == "holding":
                out[field] = {k: _ev(x) for k, x in v.items() if k in ("tax", "management", "insurance", "other") and x}
                out[field]["plan"] = str(v.get("plan") or "")[:500]
            elif field == "remodel":
                out[field] = {k: _ev(v[k]) for k in ("priceAfter", "quote") if v.get(k)}
                out[field]["costs"] = {k: _ev(x) for k, x in (v.get("costs") or {}).items() if k in COST_FIELDS and x}
            else:
                raise HTTPException(400, f"알 수 없는 입력 항목: {field}")
    except (ValidationError, ValueError, TypeError, KeyError, AttributeError) as e:
        raise HTTPException(400, f"입력값을 확인해 주세요({field}): {str(e).splitlines()[0][:200]}")
    return out


@app.put("/api/analyses/{analysis_id}")
def update_analysis(analysis_id: str, body: UpdateAnalysis, request: Request):
    inputs = validate_inputs(body.inputs or {})
    answers = None
    if body.answers:
        try:
            answers = Answers.model_validate(body.answers).model_dump()
        except ValidationError as e:
            raise HTTPException(400, f"답변을 확인해 주세요: {e.errors()[0]['msg']}")
    return _wrap(lambda: analyses.update(analysis_id, user_of(request), guest_of(request), inputs, answers))


# ---------------------------------------------------------------- 관심자산
@app.post("/api/analyses/{analysis_id}/save")
def save(analysis_id: str, request: Request):
    return _wrap(lambda: analyses.save_asset(require_user(request), analysis_id))


@app.get("/api/assets")
def my_assets(request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        rows = c.execute("SELECT w.id, w.analysis_id, w.created_at, a.road_addr, a.jibun_addr, a.pnu FROM watched_assets w "
                         "JOIN assets a ON a.id = w.asset_id WHERE w.user_id = ? AND w.deleted_at IS NULL ORDER BY w.created_at DESC",
                         (u["id"],)).fetchall()
        out = []
        for r in rows:
            snaps = c.execute("SELECT house_value, land_value, checked_at FROM price_snapshots WHERE watch_id = ? ORDER BY id DESC LIMIT 2",
                              (r["id"],)).fetchall()
            latest, prev = (dict(snaps[0]) if snaps else None), (dict(snaps[1]) if len(snaps) > 1 else None)
            out.append(dict(r) | {"price": latest, "previous": prev})
    return {"assets": out, "alertPct": settings.price_alert_pct}


@app.delete("/api/assets/{watch_id}")
def delete_asset(watch_id: str, request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        n = c.execute("UPDATE watched_assets SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
                      (now_iso(), watch_id, u["id"])).rowcount
    if not n:
        raise HTTPException(404, "관심자산을 찾을 수 없습니다.")
    return {"ok": True}


# ---------------------------------------------------------------- 알림(관심자산 예상 가격 변동)
@app.get("/api/notifications")
def my_notifications(request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        rows = c.execute("SELECT id, event, title, body, asset_id, created_at, read_at FROM notifications WHERE user_id = ? "
                         "AND event = 'price_change' ORDER BY created_at DESC LIMIT 100", (u["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.get("/api/notifications/unread")
def unread_count(request: Request):
    u = user_of(request)
    if not u:
        return {"count": 0}
    with dbm.connect() as c:
        n = c.execute("SELECT count(*) FROM notifications WHERE user_id = ? AND event = 'price_change' AND read_at IS NULL",
                      (u["id"],)).fetchone()[0]
    return {"count": n}


@app.post("/api/notifications/read")
def read_all(request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        c.execute("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", (now_iso(), u["id"]))
    return {"ok": True}


# ---------------------------------------------------------------- 웹 푸시(휴대폰·브라우저 알림)
@app.get("/api/push/key")
def push_key():
    return {"publicKey": settings.vapid_public_key, "enabled": push.configured()}


@app.post("/api/push/subscribe")
async def push_subscribe(request: Request):
    u = require_user(request)
    try:
        push.subscribe(u["id"], await request.json(), request.headers.get("user-agent"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(request: Request):
    u = require_user(request)
    body = await request.json()
    push.unsubscribe(u["id"], body.get("endpoint") or "")
    return {"ok": True}


@app.post("/api/push/test")
def push_test(request: Request):
    u = require_user(request)
    n = push.send(u["id"], "알림이 켜졌어요", "관심 집의 예상 가격이 바뀌면 이렇게 알려드려요.", url="/notifications")
    return {"sent": n}
