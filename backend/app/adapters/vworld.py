"""국토교통부 브이월드 국가중점데이터: 토지특성(getLandCharacteristics), 토지이용계획(getLandUseAttr).
요청은 PNU. 키 발급 때 등록한 서비스 URL 을 Referer 로 보내야 인증된다(domain 파라미터만으로는 INCORRECT_KEY)."""

from __future__ import annotations

import json

import httpx

from ..codes import num, text
from ..settings import settings
from .common import fail, get, ok, retry_transient

CHAR = {"source": "국토교통부 브이월드 토지특성정보", "url": "https://api.vworld.kr/ned/data/getLandCharacteristics", "node": "landCharacteristicss"}
USE = {"source": "국토교통부 브이월드 토지이용계획정보", "url": "https://api.vworld.kr/ned/data/getLandUseAttr", "node": "landUses"}
ERRORS = {
    "INVALID_KEY": "auth", "INCORRECT_KEY": "auth", "UNAVAILABLE_KEY": "auth", "OVER_REQUEST_LIMIT": "rate_limit",
    "URL_TYPE": "invalid_request", "PARAM_REQUIRED": "invalid_request", "INVALID_TYPE": "invalid_request",
    "INVALID_RANGE": "invalid_request", "SYSTEM_ERROR": "upstream", "UNKNOWN_ERROR": "upstream",
}


def _rows(body: str, spec: dict) -> dict:
    try:
        node = json.loads(body).get(spec["node"])
    except ValueError:
        return fail("parse", spec["source"], "응답을 해석하지 못했습니다.")
    if not node:
        return fail("parse", spec["source"], "예상한 응답 형식이 아닙니다.")
    code = node.get("resultCode") or ""
    if code in ERRORS:
        return fail(ERRORS[code], spec["source"], node.get("resultMsg") or code, code)
    raw = node.get("field") or []
    return {"ok": True, "rows": raw if isinstance(raw, list) else [raw]}


def land_from_field(f: dict) -> dict:
    return {
        "pnu": text(f.get("pnu")), "lndcgrCodeNm": text(f.get("lndcgrCodeNm")),
        "lndpclAr": num(f.get("lndpclAr")), "prposArea1Nm": text(f.get("prposArea1Nm")),
        "prposArea2Nm": text(f.get("prposArea2Nm")), "ladUseSittnNm": text(f.get("ladUseSittnNm")),
        "roadSideCodeNm": text(f.get("roadSideCodeNm")),       # 도로접면
        "tpgrphHgCodeNm": text(f.get("tpgrphHgCodeNm")),       # 지형높이
        "tpgrphFrmCodeNm": text(f.get("tpgrphFrmCodeNm")),     # 지형형상
        "pblntfPclnd": num(f.get("pblntfPclnd")), "stdrYear": text(f.get("stdrYear")),
        "stdrMt": text(f.get("stdrMt")), "lastUpdtDt": text(f.get("lastUpdtDt")),
    }


def parse_characteristics(body: str) -> dict:
    """연도별 이력 중 연도→기준월→데이터기준일자가 가장 최신인 1건."""
    r = _rows(body, CHAR)
    if not r["ok"]:
        return r
    rows = [land_from_field(x) for x in r["rows"]]
    if not rows:
        return fail("no_result", CHAR["source"], "해당 필지의 토지특성 정보가 없습니다.")
    latest = max(rows, key=lambda x: ((x["stdrYear"] or "").zfill(4), (x["stdrMt"] or "").zfill(2), x["lastUpdtDt"] or ""))
    missing = [k for k in ("lndcgrCodeNm", "lndpclAr", "prposArea1Nm", "roadSideCodeNm") if latest[k] is None]
    return ok(latest, CHAR["source"], asOf=latest["lastUpdtDt"], unit="㎡, 원/㎡", missingFields=missing)


def parse_land_use(body: str) -> dict:
    r = _rows(body, USE)
    if not r["ok"]:
        return r
    items = [{"name": text(x.get("prposAreaDstrcCodeNm")), "code": text(x.get("prposAreaDstrcCode")),
              "conflict": text(x.get("cnflcAtNm")), "updated": text(x.get("lastUpdtDt"))} for x in r["rows"]]
    if not items:
        return fail("no_result", USE["source"], "해당 필지의 토지이용계획 정보가 없습니다.")
    return ok(items, USE["source"], asOf=max((i["updated"] or "" for i in items), default=None))


async def _call(spec: dict, pnu: str) -> tuple[int | None, object]:
    headers = {"Referer": settings.vworld_domain.rstrip("/") + "/"} if settings.vworld_domain else None
    async with httpx.AsyncClient() as client:
        return await get(client, spec["url"], {"key": settings.vworld_key, "pnu": pnu, "format": "json",
                                               "numOfRows": 1000, "pageNo": 1}, spec["source"], headers)


@retry_transient
async def characteristics(pnu: str) -> dict:
    if not settings.vworld_key:
        return fail("not_configured", CHAR["source"], "VWORLD_API_KEY가 설정되지 않았습니다.")
    status, body = await _call(CHAR, pnu)
    return body if status is None else parse_characteristics(body)


@retry_transient
async def land_use(pnu: str) -> dict:
    if not settings.vworld_key:
        return fail("not_configured", USE["source"], "VWORLD_API_KEY가 설정되지 않았습니다.")
    status, body = await _call(USE, pnu)
    return body if status is None else parse_land_use(body)
