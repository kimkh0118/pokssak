"""주소 검색 → 토지·건축물·거래 사례 조회 → 지원 범위 판정.

초기 지원 대상은 건물 전체를 소유한 단독·다가구주택(건축물대장 주용도 01xxx).
공동주택 호실을 건물 전체처럼 보고 철거를 판단하지 않는다.
"""

from __future__ import annotations

import asyncio
import uuid

from . import public_data, sample_data
from .public_data import now, to_parcel

COLLECTIVE = ("아파트", "연립주택", "다세대주택", "공동주택", "오피스텔")


async def search(mode: str, keyword: str) -> dict:
    return sample_data.search(keyword) if mode == "sample" else await public_data.search_address(keyword)


def is_main_building(b: dict) -> bool:
    return not b.get("mainAtchGbCdNm") or "주건축물" in b["mainAtchGbCdNm"]


def _is_detached_house(b: dict) -> bool:
    return (b.get("mainPurpsCd") or "").startswith("01") or any(
        x in (b.get("mainPurpsCdNm") or "") for x in ("단독주택", "다가구주택", "다중주택"))


def check_scope(address: dict, buildings: dict) -> dict:
    if address.get("bdKdcd") == "1":
        return {"status": "unsupported",
                "reason": "공동주택(아파트·연립·다세대 등)의 개별 호실은 현재 지원하지 않습니다. 호실을 건물 전체처럼 보고 철거를 판단할 수 없기 때문입니다."}
    if not buildings["ok"]:
        return {"status": "unconfirmed",
                "reason": f"건축물대장 정보를 확인하지 못했습니다({buildings['error']['message']}). 단독·다가구주택인지 직접 확인해야 합니다."}
    records = buildings["data"]
    if any("집합" in (b.get("regstrKindCdNm") or "") or any(c in (b.get("mainPurpsCdNm") or "") for c in COLLECTIVE) for b in records):
        return {"status": "unsupported", "reason": "집합건축물·공동주택은 현재 지원하지 않습니다(초기 지원 대상: 단독·다가구주택)."}
    main = [b for b in records if is_main_building(b)]
    if not main:
        return {"status": "unconfirmed", "reason": "주건축물 정보가 없어 지원 대상인지 확인할 수 없습니다."}
    if not any(_is_detached_house(b) for b in main):
        purposes = ", ".join(dict.fromkeys(b.get("mainPurpsCdNm") or "알 수 없음" for b in main))
        return {"status": "unsupported", "reason": f"건축물 주용도가 '{purposes}'입니다. 현재는 단독·다가구주택만 지원합니다."}
    return {"status": "supported", "reason": "단독·다가구주택(건축물대장 주용도 기준)"}


def target_reasons(buildings: dict) -> list[str]:
    """분석 대상 확인이 필요한 이유(한 지번에 건물 여러 개, 외필지)."""
    if not buildings["ok"]:
        return []
    main = [b for b in buildings["data"] if is_main_building(b)]
    reasons = []
    if len(main) > 1:
        reasons.append(f"이 지번에 주건축물이 {len(main)}개 있습니다. 분석할 건물을 선택해 주세요.")
    if any((b.get("bylotCnt") or 0) > 0 for b in buildings["data"]):
        reasons.append("건물이 다른 필지(외필지)에도 걸쳐 있습니다. 토지 정보는 대표 필지 기준으로만 조회됩니다.")
    return reasons


async def lookup(mode: str, address: dict) -> dict:
    """선택한 주소의 토지·건축물·거래 사례를 조회한다. 실제 모드 실패는 실패 그대로 돌려준다."""
    if mode == "sample":
        known = next((a for a in sample_data.ADDRESSES if a["id"] == address.get("id")), None)
        if not known:
            raise ValueError("알 수 없는 예시 주소입니다.")
        address = known
    else:
        address = {**address, "provenance": "public_api"}

    parcel = to_parcel(address)
    no_parcel = {"ok": False, "error": {"kind": "invalid_request", "source": "조회", "message": "지번 정보가 없어 조회할 수 없습니다.", "code": None}}
    land_trades = None
    if parcel is None:
        land = buildings = trades = no_parcel
    elif mode == "sample":
        buildings = sample_data.buildings(parcel["pnu"])
        land = sample_data.land(parcel["pnu"])
        trades = sample_data.house_trades(parcel["sigunguCd"])
        land_trades = sample_data.land_trades(parcel["sigunguCd"])
    else:
        months = public_data.recent_months(12)
        buildings, land, trades, land_trades = await asyncio.gather(
            public_data.get_buildings(parcel),
            public_data.get_land(parcel["pnu"]),
            public_data.get_trades(parcel["sigunguCd"], months),
            public_data.get_trades(parcel["sigunguCd"], months, kind="land"),
        )

    return {
        "id": str(uuid.uuid4()),
        "mode": mode,
        "createdAt": now(),
        "address": address,
        "parcel": parcel,
        "land": land,
        "buildings": buildings,
        "trades": trades,
        "landTrades": land_trades,
        "scope": check_scope(address, buildings),
        "targetReasons": target_reasons(buildings),
        "mainBuildings": [b for b in buildings["data"] if is_main_building(b)] if buildings["ok"] else [],
    }
