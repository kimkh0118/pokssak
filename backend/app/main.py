"""FastAPI 앱. 화면은 /api/* 만 호출한다. 관리자 기능과 사용자별 자료 접근은 서버에서 권한을 검사한다."""

from __future__ import annotations

if __name__ == "__main__":  # 직접 실행하면 아래 상대 import가 실패하므로 안내만 하고 끝낸다
    raise SystemExit("app/main.py 는 직접 실행하지 않습니다. 대신:  backend/.venv/bin/python backend/run.py")

import logging
import os
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ValidationError

from . import analyses, auth, db as dbm, google_oauth, jobs, notify, programs, property as prop
from .clock import now, now_iso
from .schemas import (
    Answers, CreateAnalysis, Credentials, Evidence, LookupRequest, ManualNotice, NotificationSettings, ReviewAction, UpdateAnalysis,
)
from .settings import settings

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)  # 요청 주소(인증키 포함)를 로그에 남기지 않음
logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    dbm.connect().close()  # 마이그레이션
    if settings.sample_mode and os.getenv("SEED_SAMPLE", "1") == "1":
        from .seed import seed_sample
        seed_sample()
    jobs.start_scheduler()
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


def require_admin(request: Request) -> dict:
    u = require_user(request)
    if not u["isAdmin"]:
        raise HTTPException(403, "관리자만 사용할 수 있습니다.")
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
            "llm": bool(settings.anthropic_api_key), "schedule": settings.program_schedule,
            "externalNotify": {k: bool(v) for k, v in notify.providers().items()}}


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
    return {"assets": [dict(r) for r in rows]}


@app.delete("/api/assets/{watch_id}")
def delete_asset(watch_id: str, request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        n = c.execute("UPDATE watched_assets SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
                      (now_iso(), watch_id, u["id"])).rowcount
    if not n:
        raise HTTPException(404, "관심자산을 찾을 수 없습니다.")
    return {"ok": True}


# ---------------------------------------------------------------- 알림
@app.get("/api/notifications")
def my_notifications(request: Request):
    return {"items": notify.inbox(require_user(request)["id"])}


@app.post("/api/notifications/{nid}/read")
def read(nid: str, request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        c.execute("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?", (now_iso(), nid, u["id"]))
    return {"ok": True}


@app.get("/api/notifications/settings")
def get_settings(request: Request):
    u = require_user(request)
    with dbm.connect() as c:
        s = c.execute("SELECT in_app, email, sms, push FROM notification_settings WHERE user_id = ?", (u["id"],)).fetchone()
    return {"settings": {k: bool(s[k]) for k in s.keys()} if s else NotificationSettings().model_dump(),
            "available": {k: bool(v) for k, v in notify.providers().items()}}


@app.put("/api/notifications/settings")
def put_settings(body: NotificationSettings, request: Request):
    u = require_user(request)
    p = notify.providers()
    for ch in ("email", "sms", "push"):
        if getattr(body, ch) and not p[ch]:
            raise HTTPException(400, f"{ch} 발송 공급자가 설정되지 않아 신청할 수 없습니다(앱 내 알림은 사용 가능).")
    with dbm.connect() as c:
        c.execute("INSERT INTO notification_settings VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET "
                  "in_app=excluded.in_app, email=excluded.email, sms=excluded.sms, push=excluded.push, updated_at=excluded.updated_at",
                  (u["id"], int(body.in_app), int(body.email), int(body.sms), int(body.push), now_iso()))
    return {"ok": True}


# ---------------------------------------------------------------- 지원사업(공개)
@app.get("/api/programs")
def list_programs(sample: bool = False):
    return {"programs": programs.published(include_sample=sample, active_only=True), "note": "주간 갱신 자료이며 실시간 정보가 아닙니다."}


# ---------------------------------------------------------------- 관리자
@app.get("/api/admin/candidates")
def admin_candidates(request: Request, status: str = "pending"):
    require_admin(request)
    with dbm.connect() as c:
        rows = c.execute("SELECT k.id, k.program_id, k.status, k.important_changes, k.validation, k.model_version, k.parser_version, "
                         "k.created_at, d.url, d.content_type, p.review_state, p.is_sample FROM program_candidates k "
                         "JOIN program_documents d ON d.id = k.document_id JOIN programs p ON p.id = k.program_id "
                         "WHERE k.status = ? ORDER BY k.created_at DESC", (status,)).fetchall()
        docs = c.execute("SELECT id, url, content_type, extract_status, extract_error, fetched_at, is_sample FROM program_documents "
                         "WHERE extract_status != 'ok' ORDER BY fetched_at DESC").fetchall()
    return {"candidates": [dict(r) | {"important_changes": dbm.loads(r["important_changes"]), "validation": dbm.loads(r["validation"])}
                           for r in rows],
            "extractFailures": [dict(d) for d in docs]}


@app.get("/api/admin/candidates/{cid}")
def admin_candidate(cid: str, request: Request):
    require_admin(request)
    with dbm.connect() as c:
        k = c.execute("SELECT k.*, d.raw_text, d.url FROM program_candidates k JOIN program_documents d ON d.id = k.document_id "
                      "WHERE k.id = ?", (cid,)).fetchone()
        if not k:
            raise HTTPException(404, "후보를 찾을 수 없습니다.")
        cur = c.execute("SELECT v.data, v.version_no FROM programs p JOIN program_versions v ON v.id = p.current_version_id "
                        "WHERE p.id = ?", (k["program_id"],)).fetchone()
        log = c.execute("SELECT * FROM review_log WHERE candidate_id = ? ORDER BY at", (cid,)).fetchall()
    return {"candidate": dict(k) | {"data": dbm.loads(k["data"]), "validation": dbm.loads(k["validation"]),
                                    "important_changes": dbm.loads(k["important_changes"])},
            "current": {"data": dbm.loads(cur["data"]), "versionNo": cur["version_no"]} if cur else None,
            "fields": programs.FIELDS, "log": [dict(x) for x in log]}


@app.post("/api/admin/candidates/{cid}")
def admin_review(cid: str, body: ReviewAction, request: Request):
    u = require_admin(request)
    try:
        if body.action == "approve":
            vid = programs.publish(cid, actor=u["email"], edited=body.edited)
            notify.generate(analyses.profile_for)
            notify.dispatch()
            return {"versionId": vid}
        programs.reject(cid, actor=u["email"], note=body.note)
        return {"ok": True}
    except programs.ReviewError as e:
        raise HTTPException(400, str(e))


@app.post("/api/admin/notices")
def admin_manual_notice(body: ManualNotice, request: Request):
    """자동 수집 조건이 불명확한 공식 공고를 관리자가 원문 그대로 등록(허용된 원문만)."""
    u = require_admin(request)
    res = programs.ingest(body.noticeKey, body.url, body.text.encode(), "text/plain", posted_at=body.postedAt)
    if body.publish and res.get("candidate") and not res.get("autoPublished"):
        programs.publish(res["candidate"], actor=f"admin:{u['email']}")
        res["published"] = True
    return res


@app.get("/api/admin/programs")
def admin_programs(request: Request):
    """발행된 지원사업 전체(진행·예정·미확인 / 기간 종료 / 삭제됨)."""
    require_admin(request)
    return {"programs": programs.published(include_sample=False, include_removed=True)}


class RemoveProgram(BaseModel):
    reason: str | None = None


@app.post("/api/admin/programs/{pid}/remove")
def admin_remove_program(pid: str, body: RemoveProgram, request: Request):
    u = require_admin(request)
    try:
        programs.remove(pid, u["email"], body.reason)
    except programs.ReviewError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@app.post("/api/admin/programs/{pid}/restore")
def admin_restore_program(pid: str, request: Request):
    require_admin(request)
    programs.restore(pid)
    return {"ok": True}


@app.get("/api/admin/jobs")
def admin_jobs(request: Request):
    require_admin(request)
    with dbm.connect() as c:
        sources = [dict(r) for r in c.execute("SELECT * FROM program_sources")]
        locks = [dict(x) for x in c.execute("SELECT * FROM job_locks")]
    return {"coverage": jobs.coverage(), "runs": jobs.runs(), "sources": sources, "locks": locks, "schedule": settings.program_schedule,
            "nextRun": jobs.next_run(settings.program_schedule, now()).isoformat(), "schedulerEnabled": settings.scheduler_enabled}


@app.post("/api/admin/jobs/weekly")
def admin_run_weekly(request: Request, backfill: bool = False):
    require_admin(request)
    # Discovery can take minutes. Return immediately, keep progress in job_runs.
    import threading
    if not jobs.acquire("weekly_programs"):
        return {"status": "skipped_locked"}
    def worker():
        try:
            jobs.run("weekly_programs_worker", "backfill" if backfill else "manual", lambda: jobs.weekly(backfill=backfill), retry_delays=())
        finally:
            jobs.release("weekly_programs")
    threading.Thread(target=worker, name="manual-program-collection", daemon=True).start()
    return {"status": "queued"}
