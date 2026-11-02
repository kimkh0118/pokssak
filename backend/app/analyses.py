"""분석: 공공자료 + 네 질문 + 상담·견적 입력 → 참고가격·계산·추천·지원사업 매칭·철거 플랜.
분석은 입력(답변·근거)만 저장하고 결과는 같은 규칙 버전으로 다시 계산한다.
접근 권한: 로그인 사용자는 본인 분석만, 비회원은 같은 브라우저 세션 토큰으로만 열 수 있다."""

from __future__ import annotations

import uuid

from . import condition, demolition, trend, valuation, comps, db as dbm, eligibility, engine, explain, plan
from .auth import token_hash
from .clock import now_iso, today_kst
from .property import get_lookup, is_main


class AccessError(Exception):
    pass


class NotFound(Exception):
    pass


class NotEligible(Exception):
    """부산 단독·다가구주택이 아니면 분석·내 자산 저장을 하지 않는다."""


BLOCKING = {"busan": "부산광역시에 있는 집만 분석할 수 있어요.",
            "type": "단독·다가구주택만 분석하고 내 자산으로 저장할 수 있어요. 아파트·연립·다세대·상가 등은 대상이 아니에요."}


def ensure_target(lk: dict):
    for c in lk.get("checks") or []:
        if c.get("key") in BLOCKING and c.get("status") == "fail":
            raise NotEligible(BLOCKING[c["key"]])


def _scope_key(pnu: str, building_key: str | None) -> str:
    return f"{pnu}:{building_key or 'all'}"


def create(lookup_id: str, answers: dict, scope: dict, user: dict | None, guest_token: str | None) -> dict:
    lk = get_lookup(lookup_id)
    if not lk:
        raise NotFound("조회 기록을 찾을 수 없습니다. 주소부터 다시 진행해 주세요.")
    ensure_target(lk)
    # 집 상태 점수(객관식 + 주관식)를 한 번 계산해 답과 함께 저장 → 이후 계산·매일 가격 확인은 이 값을 그대로 쓴다
    answers = {**answers, "assessment": condition.assess(answers, answers.get("notes"))}
    a = lk["address"]
    key = _scope_key(lk["pnu"], scope.get("buildingKey"))
    aid, now = str(uuid.uuid4()), now_iso()
    with dbm.connect() as c:
        row = c.execute("SELECT id FROM assets WHERE scope_key = ?", (key,)).fetchone()
        asset_id = row["id"] if row else str(uuid.uuid4())
        if not row:
            c.execute("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                      (asset_id, key, lk["pnu"], scope.get("buildingKey"), a.get("roadAddr"), a.get("jibunAddr"), a.get("sggNm"), now))
        c.execute("INSERT INTO analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                  (aid, asset_id, lookup_id, user["id"] if user else None, None if user else token_hash(guest_token or ""),
                   dbm.dumps({**answers, "scope": scope}), engine.RULE_VERSION, now, now))
    saved = save_asset(user, aid) if user else None
    return {"id": aid, "saved": saved}


# 질문에 답하기 전(정보 확인 단계)에 내 자산으로 저장할 때 쓰는 임시 답변.
# 모르는 값은 'unknown', 소유 형태는 가장 흔한 단독 소유로 두고 draft 표시 → 결과 화면에서 답하라고 안내한다.
DRAFT_ANSWERS = {"ownership": "single", "corporate": False, "ownerMismatch": False, "usage": "unknown",
                 "direction": "undecided", "condition": "unknown", "access": "unknown", "vacancyMonths": None, "draft": True}


def watch_from_lookup(lookup_id: str, scope: dict, user: dict) -> dict:
    """정보 확인 단계에서 바로 내 자산으로 저장(질문은 나중에)."""
    out = create(lookup_id, DRAFT_ANSWERS, scope, user, None)
    return {"analysisId": out["id"], "saved": out["saved"]}


def save_asset(user: dict, analysis_id: str) -> dict:
    """로그인 사용자의 조회 완료 시 내 자산으로 자동 저장(같은 범위는 중복 저장하지 않음)."""
    with dbm.connect() as c:
        an = c.execute("SELECT asset_id FROM analyses WHERE id = ? AND owner_user_id = ?", (analysis_id, user["id"])).fetchone()
        if not an:
            raise AccessError("이 분석에 접근할 수 없습니다.")
        row = c.execute("SELECT id, deleted_at FROM watched_assets WHERE user_id = ? AND asset_id = ?", (user["id"], an["asset_id"])).fetchone()
        if row:
            c.execute("UPDATE watched_assets SET analysis_id = ?, deleted_at = NULL WHERE id = ?", (analysis_id, row["id"]))
            out = {"id": row["id"], "created": False}
        else:
            wid = str(uuid.uuid4())
            c.execute("INSERT INTO watched_assets VALUES (?, ?, ?, ?, ?, NULL)", (wid, user["id"], an["asset_id"], analysis_id, now_iso()))
            out = {"id": wid, "created": True}
    from . import pricewatch  # 예상 가격 기준값(이후 변동 알림의 비교 대상)
    try:
        pricewatch.baseline(out["id"], analysis_id)
    except Exception:  # noqa: BLE001 — 기준값 실패가 저장을 막지 않게
        pass
    return out


def _row(analysis_id: str, user: dict | None, guest_token: str | None):
    with dbm.connect() as c:
        row = c.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if not row:
        raise NotFound("분석을 찾을 수 없습니다.")
    if row["owner_user_id"]:
        if not user or (user["id"] != row["owner_user_id"] and not user.get("isAdmin")):
            raise AccessError("이 분석에 접근할 수 없습니다.")
    elif row["guest_token_hash"] != token_hash(guest_token or ""):
        raise AccessError("이 분석은 처음 조회한 브라우저에서만 열 수 있습니다. 저장하려면 로그인하세요.")
    return row


def inputs_of(analysis_id: str) -> dict:
    with dbm.connect() as c:
        rows = c.execute("SELECT field, payload FROM evidence_inputs WHERE analysis_id = ?", (analysis_id,)).fetchall()
    return {r["field"]: dbm.loads(r["payload"]) for r in rows}


def update(analysis_id: str, user, guest, inputs: dict | None, answers: dict | None) -> dict:
    row = _row(analysis_id, user, guest)
    with dbm.connect() as c:
        for field, payload in (inputs or {}).items():
            if payload is None:
                c.execute("DELETE FROM evidence_inputs WHERE analysis_id = ? AND field = ?", (analysis_id, field))
            else:
                c.execute("INSERT INTO evidence_inputs VALUES (?, ?, ?, ?) ON CONFLICT(analysis_id, field) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
                          (analysis_id, field, dbm.dumps(payload), now_iso()))
        if answers:
            old = dbm.loads(row["answers"])
            merged = {**old, **answers}
            merged.pop("draft", None)  # 질문에 답했으면 임시 답변 표시를 지운다
            merged["assessment"] = condition.assess(merged, merged.get("notes"))
            c.execute("UPDATE analyses SET answers = ?, updated_at = ? WHERE id = ?", (dbm.dumps(merged), now_iso(), analysis_id))
        else:
            c.execute("UPDATE analyses SET updated_at = ? WHERE id = ?", (now_iso(), analysis_id))
    return get(analysis_id, user, guest)


def compute(row) -> dict:
    lk = get_lookup(row["lookup_id"])
    answers = dbm.loads(row["answers"])
    scope = answers.get("scope") or {}
    inputs = inputs_of(row["id"])
    main = lk["mainBuildings"]
    building = next((x for x in main if x.get("mgmBldrgstPk") == scope.get("buildingKey")), main[0] if len(main) == 1 else None)
    land = lk["land"]["data"] if lk["land"]["ok"] else {}
    land_area = land.get("lndpclAr") or (building or {}).get("platArea")
    build_year = int(building["useAprDay"][:4]) if building and building.get("useAprDay") else None
    subject = {"umdNm": lk["address"].get("emdNm"), "landArea": land_area, "buildYear": build_year, "jimok": land.get("lndcgrCodeNm") or "대"}
    reference = {
        "house": comps.reference_price("house", lk["houseTrades"], subject, lk["months"]["base"], lk["months"]["extended"]),
        "land": comps.reference_price("land", lk["landTrades"], subject, lk["months"]["base"], lk["months"]["extended"]),
    }
    # 중개사 방식 추정(거래 비교 + 원가법 + 공시가격 비율). 값이 나오면 비교 기준값으로 쓴다(상담 가격 입력 시 그 값이 우선)
    val = valuation.estimate(subject, land, building, reference["house"], lk["landTrades"], lk.get("housePrice"), lk["months"], today_kst())
    for k in ("house", "land"):
        est = val[k]
        reference[k]["valuation"] = est
        if est["value"]:
            reference[k].update(value=est["value"], range=est["range"], estimated=True)
    # 집 상태 보정: 그대로 팔 때(집값)에만. 땅값은 건물 상태와 무관
    reference["house"] = condition.apply(reference["house"], answers.get("assessment") or condition.assess(answers, None))
    elig = eligibility.evaluate(answers, lk["checks"], scope)
    # 철거비를 따로 입력하지 않았으면 예상 철거비(개략 범위)로 비교한다(가정값 — 확정 추천 근거는 아님)
    demo = demolition.estimate(building, answers, today_kst().year)
    calc_inputs = inputs
    if demo and not (inputs.get("D") or {}).get("quote"):
        calc_inputs = inputs | {"D": {"quote": {"kind": "assumption", "min": demo["min"], "max": demo["max"],
                                                "source": "예상 철거비(개략)", "checkedOn": today_kst().isoformat()}}}
    result = engine.evaluate(calc_inputs, {"eligibility": elig, "reference": reference,
                                      "floorArea": (building or {}).get("totArea"), "access": answers.get("access")})
    out = {
        "id": row["id"], "mode": lk["mode"], "ruleVersion": row["rule_version"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        "address": lk["address"], "pnu": lk["pnu"], "checks": lk["checks"],
        "public": {k: lk[k] for k in ("buildings", "land", "landUse")} | {"mainBuildings": main, "building": building},
        "tradeStatus": {k: {kk: lk[k].get(kk) for kk in ("ok", "failedMonths", "meta", "error")} for k in ("houseTrades", "landTrades")},
        "answers": answers, "inputs": inputs, "eligibility": elig, "reference": reference, "result": result,
        "explanation": explain.ai_explain(result, answers.get("direction")),
        "demolitionEstimate": demo,
        "trend": {"official": trend.official(land, lk.get("housePrice"), land_area),
                  "trades": trend.trades(lk["houseTrades"], lk["landTrades"], subject, lk["months"]["extended"])},
        "holding": engine.holding_guide(inputs), "remodel": engine.remodel_option(inputs),
    }
    out["plan"] = plan.build(out)
    return out


def get(analysis_id: str, user: dict | None, guest: str | None) -> dict:
    return compute(_row(analysis_id, user, guest))


