"""국토교통부 건축HUB 건축물대장 표제부(getBrTitleInfo). 요청: 시군구코드·법정동코드·대지구분(0 대지/1 산)·번·지."""

from __future__ import annotations

import httpx

from ..codes import num, parse_pnu, text
from ..settings import settings
from .common import fail, get, ok, parse_data_go_kr, retry_transient

SOURCE = "국토교통부 건축HUB 건축물대장정보 서비스(표제부)"
URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
KEY_FIELDS = ["mainPurpsCdNm", "strctCdNm", "totArea", "platArea", "grndFlrCnt", "useAprDay"]


def building_from_item(i: dict) -> dict:
    return {
        "mgmBldrgstPk": text(i.get("mgmBldrgstPk")),
        "regstrKindCdNm": text(i.get("regstrKindCdNm")),
        "mainAtchGbCdNm": text(i.get("mainAtchGbCdNm")),
        "mainPurpsCd": text(i.get("mainPurpsCd")),
        "mainPurpsCdNm": text(i.get("mainPurpsCdNm")),
        "strctCdNm": text(i.get("strctCdNm")),
        "platArea": num(i.get("platArea")),   # 대지면적 ㎡
        "totArea": num(i.get("totArea")),     # 연면적 ㎡
        "grndFlrCnt": num(i.get("grndFlrCnt")),
        "ugrndFlrCnt": num(i.get("ugrndFlrCnt")),
        "archArea": num(i.get("archArea")),   # 건축면적 ㎡(지붕 면적 근사)
        "heit": num(i.get("heit")),           # 높이 m
        "roofCdNm": text(i.get("roofCdNm")),  # 지붕 구조(슬레이트 여부 판단)
        "useAprDay": text(i.get("useAprDay")),
        "dongNm": text(i.get("dongNm")),
        "bylotCnt": num(i.get("bylotCnt")),   # 외필지수
        "platPlc": text(i.get("platPlc")),
        "crtnDay": text(i.get("crtnDay")),
    }


@retry_transient
async def titles(pnu: str) -> dict:
    if not settings.data_go_kr_key:
        return fail("not_configured", SOURCE, "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.")
    p = parse_pnu(pnu)
    async with httpx.AsyncClient() as client:
        status, body = await get(client, URL, {
            "serviceKey": settings.data_go_kr_key, "sigunguCd": p["sigunguCd"], "bjdongCd": p["bjdongCd"],
            "platGbCd": p["platGbCd"], "bun": p["bun"], "ji": p["ji"], "_type": "json", "numOfRows": 100, "pageNo": 1,
        }, SOURCE)
    if status is None:
        return body
    parsed = parse_data_go_kr(body, status, SOURCE)
    if not parsed["ok"]:
        return parsed
    if not parsed["items"]:
        return fail("no_result", SOURCE, "해당 지번의 건축물대장 표제부가 없습니다.")
    records = [building_from_item(i) for i in parsed["items"]]
    return ok(records, SOURCE, asOf=records[0]["crtnDay"], unit="㎡",
              missingFields=sorted({f for r in records for f in KEY_FIELDS if r[f] is None}))
