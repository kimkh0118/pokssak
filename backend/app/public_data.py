"""공공데이터 API 4종 호출과 응답 해석. (2026-10-21 공식 명세와 실제 호출로 확인)

| 데이터       | 제공                         | 엔드포인트 |
|--------------|------------------------------|-----------|
| 주소 검색    | 행정안전부 주소기반산업지원서비스 | business.juso.go.kr/addrlink/addrLinkApi.do |
| 건축물대장   | 국토교통부 건축HUB(공공데이터포털) | apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo |
| 실거래가     | 국토교통부 단독/다가구 매매(공공데이터포털) | apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade |
| 토지특성     | 국토교통부 브이월드            | api.vworld.kr/ned/data/getLandCharacteristics |
| 토지 실거래  | 국토교통부 토지 매매(공공데이터포털) | apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade |

모든 함수는 {"ok": True, "data": ..., "meta": {...}} 또는 {"ok": False, "error": {...}} 를 돌려준다.
오류 종류(kind): not_configured, auth, rate_limit, no_result, invalid_request, upstream, network, parse
실제 조회가 실패해도 예시 데이터로 바꾸지 않는다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone

import httpx

from .settings import settings

log = logging.getLogger("public_data")

JUSO_SOURCE = "행정안전부 주소기반산업지원서비스 도로명주소 검색 API"
BUILDING_SOURCE = "국토교통부 건축HUB 건축물대장정보 서비스(표제부)"
TRADE_SOURCE = "국토교통부 단독/다가구 매매 실거래가 자료"
LAND_TRADE_SOURCE = "국토교통부 토지 매매 실거래가 자료"
LAND_SOURCE = "국토교통부 브이월드 토지특성정보(토지특성속성조회)"


# ---------------------------------------------------------------- 공통
def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hide_keys(text: str) -> str:
    """오류 메시지·로그에서 인증키를 가린다."""
    for key in (settings.juso_key, settings.data_go_kr_key, settings.vworld_key):
        if key:
            text = text.replace(key, "***")
    return text


def fail(kind: str, source: str, message: str, code: str | None = None) -> dict:
    return {"ok": False, "error": {"kind": kind, "source": source, "message": hide_keys(message), "code": code}}


def ok(data, source: str, provenance: str = "public_api", **meta) -> dict:
    return {"ok": True, "data": data, "meta": {"source": source, "provenance": provenance, "fetchedAt": now(), **meta}}


def num(v) -> float | None:
    """'12,345' → 12345.0, 빈 값 → None (0이 아님)."""
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    try:
        return float(s) if s else None
    except ValueError:
        return None


def text(v) -> str | None:
    s = "" if v is None else str(v).strip()
    return s or None


async def get(client: httpx.AsyncClient, url: str, params: dict, source: str, headers: dict | None = None):
    try:
        r = await client.get(url, params=params, headers=headers, timeout=settings.timeout_seconds)
        return r.status_code, r.text
    except httpx.TimeoutException:
        log.warning("%s 응답 시간 초과", source)
        return None, fail("network", source, "응답 시간이 초과되었습니다.")
    except httpx.HTTPError as e:
        log.warning("%s 호출 실패: %s", source, hide_keys(str(e)))
        return None, fail("network", source, "네트워크 오류로 조회하지 못했습니다.")


# ---------------------------------------------------------------- 1. 주소 검색
JUSO_AUTH_CODES = {"E0001", "E0014"}  # 미승인 키, 개발키 만료


async def search_address(keyword: str) -> dict:
    if not settings.juso_key:
        return fail("not_configured", JUSO_SOURCE, "JUSO_API_KEY가 설정되지 않았습니다.")
    async with httpx.AsyncClient() as client:
        status, body = await get(client, "https://business.juso.go.kr/addrlink/addrLinkApi.do", {
            "confmKey": settings.juso_key, "currentPage": 1, "countPerPage": 10,
            "keyword": keyword, "resultType": "json",
        }, JUSO_SOURCE)
    if status is None:
        return body
    try:
        results = json.loads(body)["results"]
    except (ValueError, KeyError):
        return fail("parse", JUSO_SOURCE, f"응답을 해석하지 못했습니다(HTTP {status}).")
    common = results.get("common") or {}
    code = common.get("errorCode", "")
    if code != "0":
        kind = "auth" if code in JUSO_AUTH_CODES else "upstream" if code == "-999" else "invalid_request"
        return fail(kind, JUSO_SOURCE, common.get("errorMessage") or "알 수 없는 오류", code)
    return ok([address_from_juso(j) for j in results.get("juso") or []], JUSO_SOURCE)


def address_from_juso(j: dict) -> dict:
    adm = str(j.get("admCd") or "")
    bun = num(j.get("lnbrMnnm") or j.get("InbrMnnm"))  # 공식 문서 표기 오탈자(InbrMnnm) 대비
    ji = num(j.get("lnbrSlno"))
    return {
        "id": f"{adm}-{j.get('mtYn', '0')}-{int(bun) if bun is not None else ''}-{int(ji) if ji is not None else ''}-{j.get('bdMgtSn') or ''}",
        "roadAddr": j.get("roadAddr") or "",
        "jibunAddr": j.get("jibunAddr") or "",
        "zipNo": j.get("zipNo"),
        "admCd": adm,  # 10자리 법정동코드
        "mtYn": "1" if j.get("mtYn") == "1" else "0",  # 1: 산
        "lnbrMnnm": int(bun) if bun is not None else None,
        "lnbrSlno": int(ji) if ji is not None else None,
        "bdMgtSn": j.get("bdMgtSn"),
        "bdNm": j.get("bdNm") or None,
        "bdKdcd": j.get("bdKdcd") if j.get("bdKdcd") in ("0", "1") else None,  # 1: 공동주택
        "siNm": j.get("siNm") or "",
        "sggNm": j.get("sggNm") or "",
        "emdNm": j.get("emdNm") or "",
        "provenance": "public_api",
    }


# ---------------------------------------------------------------- 공공데이터포털 공통 응답
DATA_GO_KR_CODES = {
    "03": "no_result",
    "20": "auth", "30": "auth", "31": "auth", "32": "auth", "12": "auth",
    "22": "rate_limit",
    "10": "invalid_request", "11": "invalid_request",
}


def _xml_to_dict(el: ET.Element):
    children = list(el)
    if not children:
        return (el.text or "").strip()
    out: dict = {}
    for c in children:
        v = _xml_to_dict(c)
        if c.tag in out:
            out[c.tag] = out[c.tag] if isinstance(out[c.tag], list) else [out[c.tag]]
            out[c.tag].append(v)
        else:
            out[c.tag] = v
    return out


def parse_data_go_kr(body: str, status: int, source: str) -> dict:
    """정상: response.header.resultCode '00'/'000'. 게이트웨이 오류: OpenAPI_ServiceResponse.cmmMsgHeader."""
    body = body.strip()
    try:
        if body.startswith("<"):
            root = ET.fromstring(body)
            doc = {root.tag: _xml_to_dict(root)}
        else:
            doc = json.loads(body)
    except (ValueError, ET.ParseError):
        if status in (401, 403):
            return fail("auth", source, f"인증 오류(HTTP {status})")
        if status == 429:
            return fail("rate_limit", source, "호출 제한을 초과했습니다.")
        return fail("parse", source, f"응답을 해석하지 못했습니다(HTTP {status}).")

    gateway = (doc.get("OpenAPI_ServiceResponse") or {}).get("cmmMsgHeader")
    if gateway:
        code = str(gateway.get("returnReasonCode", ""))
        return fail(DATA_GO_KR_CODES.get(code, "upstream"), source,
                    gateway.get("returnAuthMsg") or gateway.get("errMsg") or "게이트웨이 오류", code)

    resp = doc.get("response")
    if not resp:
        return fail("auth" if status in (401, 403) else "parse", source, "예상한 응답 형식이 아닙니다.")
    code = str((resp.get("header") or {}).get("resultCode", ""))
    if code not in ("00", "000"):
        kind = DATA_GO_KR_CODES.get(code.lstrip("0").zfill(2), "upstream")
        if kind == "no_result":
            return {"ok": True, "items": []}
        return fail(kind, source, (resp.get("header") or {}).get("resultMsg") or "오류", code)
    items = (resp.get("body") or {}).get("items")
    item = items.get("item") if isinstance(items, dict) else None
    if item is None:
        return {"ok": True, "items": []}
    return {"ok": True, "items": item if isinstance(item, list) else [item]}


# ---------------------------------------------------------------- 2. 건축물대장 표제부
BUILDING_KEY_FIELDS = ["mainPurpsCdNm", "strctCdNm", "totArea", "grndFlrCnt", "useAprDay", "platArea"]


def building_from_item(i: dict) -> dict:
    return {
        "mgmBldrgstPk": text(i.get("mgmBldrgstPk")),
        "regstrKindCdNm": text(i.get("regstrKindCdNm")),  # 일반건축물 / 집합건축물
        "mainAtchGbCdNm": text(i.get("mainAtchGbCdNm")),  # 주건축물 / 부속건축물
        "mainPurpsCd": text(i.get("mainPurpsCd")),
        "mainPurpsCdNm": text(i.get("mainPurpsCdNm")),
        "etcPurps": text(i.get("etcPurps")),
        "strctCdNm": text(i.get("strctCdNm")),
        "totArea": num(i.get("totArea")),  # 연면적 ㎡
        "platArea": num(i.get("platArea")),  # 대지면적 ㎡
        "archArea": num(i.get("archArea")),
        "grndFlrCnt": num(i.get("grndFlrCnt")),
        "ugrndFlrCnt": num(i.get("ugrndFlrCnt")),
        "useAprDay": text(i.get("useAprDay")),  # YYYYMMDD
        "hhldCnt": num(i.get("hhldCnt")),
        "fmlyCnt": num(i.get("fmlyCnt")),
        "bldNm": text(i.get("bldNm")),
        "dongNm": text(i.get("dongNm")),
        "platPlc": text(i.get("platPlc")),
        "newPlatPlc": text(i.get("newPlatPlc")),
        "bylotCnt": num(i.get("bylotCnt")),  # 외필지수
    }


async def get_buildings(parcel: dict) -> dict:
    if not settings.data_go_kr_key:
        return fail("not_configured", BUILDING_SOURCE, "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.")
    async with httpx.AsyncClient() as client:
        status, body = await get(client, "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo", {
            "serviceKey": settings.data_go_kr_key, "sigunguCd": parcel["sigunguCd"], "bjdongCd": parcel["bjdongCd"],
            "platGbCd": parcel["platGbCd"], "bun": parcel["bun"], "ji": parcel["ji"],
            "_type": "json", "numOfRows": 100, "pageNo": 1,
        }, BUILDING_SOURCE)
    if status is None:
        return body
    parsed = parse_data_go_kr(body, status, BUILDING_SOURCE)
    if not parsed["ok"]:
        return parsed
    if not parsed["items"]:
        return fail("no_result", BUILDING_SOURCE, "해당 지번의 건축물대장 표제부가 없습니다.")
    records = [building_from_item(i) for i in parsed["items"]]
    missing = sorted({f for r in records for f in BUILDING_KEY_FIELDS if r[f] is None})
    return ok(records, BUILDING_SOURCE, asOf=text(parsed["items"][0].get("crtnDay")),
              missingFields=missing, note="기준일은 대장 생성일자(crtnDay)")


# ---------------------------------------------------------------- 3. 단독/다가구 매매 실거래가
def trade_from_item(i: dict) -> dict:
    """지역·계약년월 단위 자료이며 지번이 일부만 공개된다. 대상 주소의 거래 이력으로 연결하지 않는다."""
    year = num(i.get("buildYear"))
    return {
        "kind": "house",
        "sggCd": text(i.get("sggCd")),
        "umdNm": text(i.get("umdNm")),
        "houseType": text(i.get("houseType")),
        "jibunPartial": text(i.get("jibun")),
        "landArea": num(i.get("plottageAr")),
        "floorArea": num(i.get("totalFloorAr")),
        "dealDate": f"{text(i.get('dealYear')) or '0000'}-{(text(i.get('dealMonth')) or '1').zfill(2)}-{(text(i.get('dealDay')) or '1').zfill(2)}",
        "amountWon": round(num(i.get("dealAmount")) * 10_000) if num(i.get("dealAmount")) is not None else None,  # 만원 → 원
        "buildYear": int(year) if year and year > 1900 else None,  # 실제 자료의 1900은 '미상'
        "cancelled": text(i.get("cdealType")) == "O" or bool(text(i.get("cdealDay"))),
        "dealingGbn": text(i.get("dealingGbn")),
    }


def recent_months(n: int, today: date | None = None) -> list[str]:
    """이번 달을 뺀 최근 n개월 YYYYMM(신고 지연 고려)."""
    today = today or date.today()
    out = []
    y, m = today.year, today.month
    for _ in range(n):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append(f"{y}{m:02d}")
    return out


def land_trade_from_item(i: dict) -> dict:
    """토지 매매 실거래(15126466). 지목·용도지역·지분거래 여부를 함께 보관한다."""
    amount = num(i.get("dealAmount"))
    return {
        "kind": "land",
        "sggCd": text(i.get("sggCd")),
        "umdNm": text(i.get("umdNm")),
        "houseType": None,
        "jibunPartial": text(i.get("jibun")),
        "landArea": num(i.get("dealArea")),
        "floorArea": None,
        "dealDate": f"{text(i.get('dealYear')) or '0000'}-{(text(i.get('dealMonth')) or '1').zfill(2)}-{(text(i.get('dealDay')) or '1').zfill(2)}",
        "amountWon": round(amount * 10_000) if amount is not None else None,
        "buildYear": None,
        "cancelled": text(i.get("cdealType")) == "O" or bool(text(i.get("cdealDay"))),
        "dealingGbn": text(i.get("dealingGbn")),
        "landUse": text(i.get("jimok")),  # 지목(대·전·답·도로 …)
        "zoning": text(i.get("landUse")),  # 용도지역
        "shareDeal": text(i.get("shareDealingType")) == "지분",
    }


async def get_trades(lawd_cd: str, months: list[str], kind: str = "house") -> dict:
    """kind: house(단독/다가구 매매) | land(토지 매매). 지역·계약월 단위로 조회한다."""
    if kind == "land":
        source, url, mapper = (LAND_TRADE_SOURCE,
                               "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade",
                               land_trade_from_item)
    else:
        source, url, mapper = (TRADE_SOURCE,
                               "https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade",
                               trade_from_item)
    if not settings.data_go_kr_key:
        return fail("not_configured", source, "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.")

    async with httpx.AsyncClient() as client:
        async def one(ym: str):
            status, body = await get(client, url, {"serviceKey": settings.data_go_kr_key, "LAWD_CD": lawd_cd,
                                                   "DEAL_YMD": ym, "pageNo": 1, "numOfRows": 1000}, source)
            return ym, (body if status is None else parse_data_go_kr(body, status, source))
        results = await asyncio.gather(*(one(ym) for ym in months))

    failed = [(ym, r) for ym, r in results if not r["ok"]]
    # 인증·호출제한 오류는 전체 실패로 본다(부분 결과로 숨기지 않음)
    for _, r in failed:
        if r["error"]["kind"] in ("auth", "rate_limit"):
            return r
    if len(failed) == len(results):
        return failed[0][1]
    trades = [mapper(i) for _, r in results if r["ok"] for i in r["items"]]
    failed_months = [ym for ym, _ in failed]
    result = ok(trades, source, asOf=f"{months[-1]}~{months[0]} 계약분",
                note=f"일부 월 조회 실패: {', '.join(failed_months)}" if failed_months else None)
    result.update(monthsQueried=months, failedMonths=failed_months)
    return result


# ---------------------------------------------------------------- 4. 브이월드 토지특성
VWORLD_ERRORS = {
    "INVALID_KEY": "auth", "INCORRECT_KEY": "auth", "UNAVAILABLE_KEY": "auth",
    "OVER_REQUEST_LIMIT": "rate_limit",
    "URL_TYPE": "invalid_request", "PARAM_REQUIRED": "invalid_request",
    "INVALID_TYPE": "invalid_request", "INVALID_RANGE": "invalid_request",
    "SYSTEM_ERROR": "upstream", "UNKNOWN_ERROR": "upstream",
}
LAND_KEY_FIELDS = ["lndcgrCodeNm", "lndpclAr", "prposArea1Nm", "pblntfPclnd", "stdrYear"]


def land_from_field(f: dict) -> dict:
    return {
        "pnu": text(f.get("pnu")) or "",
        "ldCodeNm": text(f.get("ldCodeNm")),
        "mnnmSlno": text(f.get("mnnmSlno")),
        "lndcgrCodeNm": text(f.get("lndcgrCodeNm")),  # 지목
        "lndpclAr": num(f.get("lndpclAr")),  # 토지면적 ㎡
        "prposArea1Nm": text(f.get("prposArea1Nm")),  # 용도지역
        "prposArea2Nm": text(f.get("prposArea2Nm")),
        "ladUseSittnNm": text(f.get("ladUseSittnNm")),
        "roadSideCodeNm": text(f.get("roadSideCodeNm")),
        "pblntfPclnd": num(f.get("pblntfPclnd")),  # 공시지가 원/㎡
        "stdrYear": text(f.get("stdrYear")),
        "stdrMt": text(f.get("stdrMt")),
        "lastUpdtDt": text(f.get("lastUpdtDt")),
    }


def parse_vworld_land(body: str) -> dict:
    """연도별 이력이 오래된 순으로 오고 같은 연도에 기준월이 다른 행이 있다 → 연도·월·기준일자로 최신 1건."""
    try:
        node = json.loads(body).get("landCharacteristicss")
    except ValueError:
        return fail("parse", LAND_SOURCE, "응답을 해석하지 못했습니다.")
    if not node:
        return fail("parse", LAND_SOURCE, "예상한 응답 형식이 아닙니다.")
    code = node.get("resultCode") or ""
    if code in VWORLD_ERRORS:
        return fail(VWORLD_ERRORS[code], LAND_SOURCE, node.get("resultMsg") or code, code)
    raw = node.get("field") or []
    rows = [land_from_field(f) for f in (raw if isinstance(raw, list) else [raw])]
    if not rows:
        return fail("no_result", LAND_SOURCE, "해당 필지의 토지특성 정보가 없습니다.")
    latest = max(rows, key=lambda r: ((r["stdrYear"] or "").zfill(4), (r["stdrMt"] or "").zfill(2), r["lastUpdtDt"] or ""))
    return ok(latest, LAND_SOURCE, asOf=latest["lastUpdtDt"],
              missingFields=[k for k in LAND_KEY_FIELDS if latest[k] is None])


async def get_land(pnu: str) -> dict:
    if not settings.vworld_key:
        return fail("not_configured", LAND_SOURCE, "VWORLD_API_KEY가 설정되지 않았습니다.")
    # 키 발급 때 등록한 서비스 URL을 Referer 로 보내야 인증된다(domain 파라미터만으로는 INCORRECT_KEY)
    headers = {"Referer": settings.vworld_domain.rstrip("/") + "/"} if settings.vworld_domain else None
    async with httpx.AsyncClient() as client:
        status, body = await get(client, "https://api.vworld.kr/ned/data/getLandCharacteristics", {
            "key": settings.vworld_key, "pnu": pnu, "format": "json", "numOfRows": 1000, "pageNo": 1,
        }, LAND_SOURCE, headers)
    return body if status is None else parse_vworld_land(body)


# ---------------------------------------------------------------- 주소 → 필지 식별자
def to_parcel(address: dict) -> dict | None:
    adm = address.get("admCd") or ""
    if not re.fullmatch(r"\d{10}", adm) or address.get("lnbrMnnm") is None:
        return None
    bun = str(address["lnbrMnnm"]).zfill(4)
    ji = str(address.get("lnbrSlno") or 0).zfill(4)
    mountain = address.get("mtYn") == "1"
    return {
        "admCd": adm,
        "sigunguCd": adm[:5],
        "bjdongCd": adm[5:],
        "platGbCd": "1" if mountain else "0",  # 건축물대장: 0 대지, 1 산
        "bun": bun,
        "ji": ji,
        "pnu": f"{adm}{'2' if mountain else '1'}{bun}{ji}",  # 법정동코드 + 대장구분(1 일반, 2 산) + 본번 + 부번
    }
