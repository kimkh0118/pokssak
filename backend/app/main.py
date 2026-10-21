"""FastAPI 앱: 화면(frontend)이 부르는 모든 API.

GET  /api/status                       인증키 설정 여부(값은 노출하지 않음)
GET  /api/address?mode=&q=             주소 검색
POST /api/property                     토지·건축물·거래 사례 조회
POST /api/analyses                     분석 생성
GET  /api/analyses/{id}                분석 결과(열 때마다 같은 함수로 다시 계산)
PUT  /api/analyses/{id}                계산 조건 수정 → 재계산
GET  /api/analyses/summary?ids=a,b     내 분석 목록 요약
GET  /api/partners                     상담 연결 대상(예시 업체)
POST /api/consultations                상담 신청 저장('신청 접수')
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import storage
from .analysis import analyze
from .inputs import build
from .property import lookup, search
from .schemas import Answers, ConsultationRequest, CreateAnalysis, Overrides, PropertyRequest, Target, UpdateAnalysis
from .settings import settings

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="집 선택 비교 API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_methods=["*"], allow_headers=["*"])


# 화면이 쓰기 쉽게 오류는 항상 {"error": "한국어 메시지"} 형태로 돌려준다
@app.exception_handler(HTTPException)
async def http_error(_: Request, e: HTTPException):
    return JSONResponse({"error": e.detail}, status_code=e.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError):
    first = e.errors()[0] if e.errors() else {}
    where = ".".join(str(x) for x in first.get("loc", [])[1:])
    message = str(first.get("msg", "입력값이 올바르지 않습니다.")).removeprefix("Value error, ")
    return JSONResponse({"error": f"입력값이 올바르지 않습니다({where}): {message}"}, status_code=400)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- 조회
@app.get("/api/status")
def status():
    return {"juso": bool(settings.juso_key), "dataGoKr": bool(settings.data_go_kr_key), "vworld": bool(settings.vworld_key)}


@app.get("/api/address")
async def address(mode: str = Query(pattern="^(live|sample)$"), q: str = Query(min_length=2, max_length=80)):
    result = await search(mode, q.strip())
    return JSONResponse(result, status_code=200 if result["ok"] else 502)


@app.post("/api/property")
async def property_lookup(body: PropertyRequest):
    if not isinstance(body.address.get("admCd"), str):
        raise HTTPException(400, "주소 정보가 올바르지 않습니다.")
    try:
        result = await lookup(body.mode, body.address)
    except ValueError as e:
        raise HTTPException(400, str(e))
    storage.save_lookup(result)
    return result


# ---------------------------------------------------------------- 분석
def compute(saved: dict) -> dict:
    """저장된 입력으로 결과를 계산해 화면용 응답을 만든다."""
    prop = storage.get_lookup(saved["lookupId"])
    if not prop:
        raise HTTPException(404, "조회 기록을 찾을 수 없습니다. 주소부터 다시 진행해 주세요.")
    answers = Answers.model_validate(saved["answers"])
    overrides = Overrides.model_validate(saved["overrides"])
    target = Target.model_validate(saved["target"])
    built = build(prop, answers, target, overrides)
    return {
        **saved,
        "mode": prop["mode"],
        "property": prop,
        "current": built["current"],
        "facts": built["facts"],
        "assumptions": built["assumptions"],
        "comps": built["comps"],
        "landComps": built["landComps"],
        "costs": built["costs"],
        "subject": built["subject"],
        "result": analyze(built["engine"]),
        "consultations": storage.list_consultations(saved["id"]),
    }


@app.post("/api/analyses")
def create_analysis(body: CreateAnalysis):
    prop = storage.get_lookup(body.lookupId)
    if not prop:
        raise HTTPException(404, "조회 기록을 찾을 수 없습니다. 주소부터 다시 진행해 주세요.")
    if prop["scope"]["status"] == "unsupported":
        raise HTTPException(422, f"지원 범위 밖의 물건입니다: {prop['scope']['reason']}")
    if prop["scope"]["status"] == "unconfirmed" and not body.target.scopeConfirmedByUser:
        raise HTTPException(422, "단독·다가구주택인지 확인이 필요합니다.")
    if len(prop["mainBuildings"]) > 1 and not body.target.buildingPk:
        raise HTTPException(422, "분석할 건물을 선택해 주세요.")
    saved = {
        "id": str(uuid.uuid4()), "lookupId": body.lookupId, "createdAt": now(), "updatedAt": now(),
        "answers": body.answers.model_dump(), "overrides": {}, "target": body.target.model_dump(),
    }
    storage.save_analysis(saved)
    return {"id": saved["id"]}


# summary 는 {id} 보다 먼저 등록해야 경로가 겹치지 않는다
@app.get("/api/analyses/summary")
def analyses_summary(ids: str = ""):
    """내 분석 목록용 요약(개인정보 제외)."""
    items = []
    for analysis_id in [x for x in ids.split(",") if re.fullmatch(r"[0-9a-f-]{36}", x)][:30]:
        saved = storage.get_analysis(analysis_id)
        if not saved or not storage.get_lookup(saved["lookupId"]):
            items.append({"id": analysis_id, "found": False})
            continue
        full = compute(saved)
        rec = full["result"]["recommendation"]
        top = next((o for o in full["result"]["options"] if o["id"] == rec["optionId"]), None)
        items.append({
            "id": analysis_id, "found": True, "mode": full["mode"], "address": full["property"]["address"]["roadAddr"],
            "updatedAt": full["updatedAt"], "verdict": rec["verdict"],
            "optionLabel": top["variantLabel"] if top else None,
            "comparisonValue": top["scenarios"]["base"]["comparisonValue"] if top and top["computable"] else None,
        })
    return {"items": items}


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str):
    saved = storage.get_analysis(analysis_id)
    if not saved:
        raise HTTPException(404, "분석 결과를 찾을 수 없습니다.")
    return compute(saved)


@app.put("/api/analyses/{analysis_id}")
def update_analysis(analysis_id: str, body: UpdateAnalysis):
    saved = storage.get_analysis(analysis_id)
    if not saved:
        raise HTTPException(404, "분석 결과를 찾을 수 없습니다.")
    saved["overrides"] = body.overrides.model_dump(exclude_none=True)
    if body.answers:
        saved["answers"] = body.answers.model_dump()
    saved["updatedAt"] = now()
    storage.save_analysis(saved)
    return compute(saved)


# ---------------------------------------------------------------- 상담 신청
# 실제 업체 연동은 없다. 신청은 저장만 하고 '신청 접수'로 표시한다. 업체는 모두 예시이며 순위 계산에 쓰이지 않는다.
PARTNERS = [
    {"id": "sample-broker-1", "type": "broker", "name": "예시공인중개사사무소", "isSample": True},
    {"id": "sample-demolition-1", "type": "demolition", "name": "예시해체공사", "isSample": True},
    {"id": "sample-remodeling-1", "type": "remodeling", "name": "예시리모델링", "isSample": True},
]
PARTNER_TYPES_FOR_OPTION = {
    "sell_as_is": ["broker"],
    "demolish_sell_land": ["demolition", "broker"],  # 철거 후 토지 매각을 위한 중개사 연결도 제공
    "remodel": ["remodeling"],
    "keep": [],  # 결과 확인 후 종료
}


@app.get("/api/partners")
def partners():
    return {"partners": PARTNERS, "forOption": PARTNER_TYPES_FOR_OPTION}


@app.post("/api/consultations")
def create_consultation(body: ConsultationRequest):
    if not body.consent:
        raise HTTPException(400, "전달 항목 확인과 동의가 필요합니다.")
    saved = storage.get_analysis(body.analysisId)
    if not saved:
        raise HTTPException(404, "분석 결과를 찾을 수 없습니다.")
    partner = next((p for p in PARTNERS if p["id"] == body.partnerId), None)
    if not partner:
        raise HTTPException(400, "연결 대상을 찾을 수 없습니다.")
    if partner["type"] not in PARTNER_TYPES_FOR_OPTION[body.optionId]:
        raise HTTPException(400, "이 선택지에 맞지 않는 연결 대상입니다.")
    if "name" not in body.sharedFields or "phone" not in body.sharedFields:
        raise HTTPException(400, "연락을 받으려면 이름과 연락처 전달에 동의해야 합니다.")
    phone = re.sub(r"[^\d-]", "", body.contactPhone)
    if len(phone.replace("-", "")) < 9:
        raise HTTPException(400, "연락처를 확인해 주세요.")
    prop = storage.get_lookup(saved["lookupId"]) or {}
    record = {
        "id": str(uuid.uuid4()), "analysisId": body.analysisId, "optionId": body.optionId,
        "partnerId": partner["id"], "partnerType": partner["type"], "sharedFields": body.sharedFields,
        "contactName": body.contactName.strip(), "contactPhone": phone,
        "addressShared": prop.get("address", {}).get("roadAddr") if "address" in body.sharedFields else None,
        "message": body.message, "createdAt": now(),
    }
    storage.save_consultation(record)
    return {"id": record["id"], "status": "received", "partner": partner,
            "sharedFields": body.sharedFields, "createdAt": record["createdAt"]}
