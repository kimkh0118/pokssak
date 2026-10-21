"""행정안전부 도로명주소 검색 API. 응답에 PNU 는 없다(법정동코드·산 여부·지번으로 직접 조합)."""

from __future__ import annotations

import json

import httpx

from ..codes import num, pnu_from_address
from ..settings import settings
from .common import fail, get, ok, retry_transient

SOURCE = "행정안전부 도로명주소 검색 API"
URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do"


def address_from_juso(j: dict) -> dict:
    adm = str(j.get("admCd") or "")
    bun = num(j.get("lnbrMnnm") or j.get("InbrMnnm"))  # 공식 문서 표기 오탈자(InbrMnnm) 대비
    ji = num(j.get("lnbrSlno"))
    mt = "1" if j.get("mtYn") == "1" else "0"
    pnu = pnu_from_address(adm, mt, int(bun) if bun is not None else None, int(ji) if ji is not None else None)
    return {
        "id": f"{pnu or adm}-{j.get('bdMgtSn') or ''}",
        "roadAddr": j.get("roadAddr") or "",
        "jibunAddr": j.get("jibunAddr") or "",
        "admCd": adm,
        "mtYn": mt,
        "lnbrMnnm": int(bun) if bun is not None else None,
        "lnbrSlno": int(ji) if ji is not None else None,
        "buldMnnm": num(j.get("buldMnnm")),  # 도로명 건물번호(지번과 다름, PNU에 쓰지 않음)
        "bdMgtSn": j.get("bdMgtSn"),
        "bdNm": j.get("bdNm") or None,
        "bdKdcd": j.get("bdKdcd") if j.get("bdKdcd") in ("0", "1") else None,  # 1: 공동주택
        "siNm": j.get("siNm") or "",
        "sggNm": j.get("sggNm") or "",
        "emdNm": j.get("emdNm") or "",
        "pnu": pnu,
        "provenance": "public_api",
    }


@retry_transient
async def search(keyword: str) -> dict:
    if not settings.juso_key:
        return fail("not_configured", SOURCE, "JUSO_API_KEY가 설정되지 않았습니다.")
    async with httpx.AsyncClient() as client:
        status, body = await get(client, URL, {"confmKey": settings.juso_key, "currentPage": 1, "countPerPage": 20,
                                              "keyword": keyword, "resultType": "json"}, SOURCE)
    if status is None:
        return body
    try:
        results = json.loads(body)["results"]
    except (ValueError, KeyError):
        return fail("parse", SOURCE, f"응답을 해석하지 못했습니다(HTTP {status}).")
    common = results.get("common") or {}
    code = common.get("errorCode", "")
    if code != "0":
        kind = "auth" if code in ("E0001", "E0014") else "upstream" if code == "-999" else "invalid_request"
        return fail(kind, SOURCE, common.get("errorMessage") or "알 수 없는 오류", code)
    return ok([address_from_juso(j) for j in results.get("juso") or []], SOURCE)
