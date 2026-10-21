"""국토교통부 실거래 자료: 단독·다가구 매매(15126465), 토지 매매(15126466).
지역코드(시군구 5자리)·계약년월로 조회하고, totalCount 기준으로 모든 페이지를 모은다.
한 페이지라도 실패한 달은 '실패한 달'로 기록하며 거래 0건으로 처리하지 않는다.
지번은 일부만 공개되므로 복원하거나 대상 필지와 연결하지 않는다."""

from __future__ import annotations

import asyncio
import math
from datetime import date

import httpx

from ..codes import num, text
from ..settings import settings
from .common import fail, get, ok, parse_data_go_kr, retry_transient

HOUSE = {"source": "국토교통부 단독/다가구 매매 실거래가 자료",
         "url": "https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade"}
LAND = {"source": "국토교통부 토지 매매 실거래가 자료",
        "url": "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade"}
PAGE_SIZE = 1000


def _date(i: dict) -> str:
    return f"{text(i.get('dealYear')) or '0000'}-{(text(i.get('dealMonth')) or '1').zfill(2)}-{(text(i.get('dealDay')) or '1').zfill(2)}"


def _won(v) -> int | None:
    n = num(v)
    return round(n * 10_000) if n is not None else None  # 만원 → 원


def _cancelled(i: dict) -> bool:
    return text(i.get("cdealType")) == "O" or bool(text(i.get("cdealDay")))


def house_from_item(i: dict) -> dict:
    year = num(i.get("buildYear"))
    return {
        "kind": "house", "umdNm": text(i.get("umdNm")), "houseType": text(i.get("houseType")),
        "jibunMasked": text(i.get("jibun")),
        "landArea": num(i.get("plottageAr")), "floorArea": num(i.get("totalFloorAr")),
        "dealDate": _date(i), "amountWon": _won(i.get("dealAmount")),
        "buildYear": int(year) if year and year > 1900 else None,  # 실제 자료의 1900은 '미상'
        "cancelled": _cancelled(i), "dealingGbn": text(i.get("dealingGbn")), "shareDeal": False,
    }


def land_from_item(i: dict) -> dict:
    return {
        "kind": "land", "umdNm": text(i.get("umdNm")), "jibunMasked": text(i.get("jibun")),
        "landArea": num(i.get("dealArea")), "jimok": text(i.get("jimok")), "zoning": text(i.get("landUse")),
        "dealDate": _date(i), "amountWon": _won(i.get("dealAmount")),
        "cancelled": _cancelled(i), "dealingGbn": text(i.get("dealingGbn")),
        "shareDeal": text(i.get("shareDealingType")) == "지분",
    }


def recent_months(n: int, today: date) -> list[str]:
    """이번 달을 뺀 최근 n개월 YYYYMM(신고 지연 고려)."""
    out, y, m = [], today.year, today.month
    for _ in range(n):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append(f"{y}{m:02d}")
    return out


async def collect(kind: str, lawd_cd: str, months: list[str]) -> dict:
    spec, mapper = (HOUSE, house_from_item) if kind == "house" else (LAND, land_from_item)
    if not settings.data_go_kr_key:
        return fail("not_configured", spec["source"], "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.")

    async with httpx.AsyncClient() as client:
        @retry_transient
        async def page(ym: str, no: int) -> dict:
            status, body = await get(client, spec["url"], {"serviceKey": settings.data_go_kr_key, "LAWD_CD": lawd_cd,
                                                         "DEAL_YMD": ym, "pageNo": no, "numOfRows": PAGE_SIZE}, spec["source"])
            return body if status is None else parse_data_go_kr(body, status, spec["source"])

        async def month(ym: str) -> dict:
            first = await page(ym, 1)
            if not first["ok"]:
                return first
            items = list(first["items"])
            pages = math.ceil((first["totalCount"] or 0) / PAGE_SIZE)
            for no in range(2, pages + 1):
                nxt = await page(ym, no)
                if not nxt["ok"]:
                    return {**nxt, "partialPages": no - 1}
                items += nxt["items"]
            return {"ok": True, "items": items}

        results = await asyncio.gather(*(month(ym) for ym in months))

    by_month = dict(zip(months, results))
    failed = [ym for ym, r in by_month.items() if not r["ok"]]
    for r in results:  # 인증·호출 제한 오류는 전체 실패(부분 결과로 숨기지 않음)
        if not r["ok"] and r["error"]["kind"] in ("auth", "rate_limit"):
            return r
    if len(failed) == len(months):
        return results[0]
    trades = [mapper(i) for r in results if r["ok"] for i in r["items"]]
    out = ok(trades, spec["source"], asOf=f"{months[-1]}~{months[0]} 계약분", unit="원, ㎡",
             note=f"조회 실패한 달: {', '.join(failed)} (거래 0건으로 처리하지 않음)" if failed else None)
    out.update(monthsQueried=months, failedMonths=failed)
    return out
