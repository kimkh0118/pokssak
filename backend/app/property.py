"""주소 → 6개 공공자료 조회 → 기본정보·범위·지원 대상 점검. 공공자료 캐시(public_lookups)에는 개인정보가 없다."""

from __future__ import annotations

import asyncio
import uuid

from . import db as dbm
from .adapters import building, juso, sample, trades, vworld
from .clock import now_iso, today_kst
from .codes import is_busan

COLLECTIVE = ("아파트", "연립주택", "다세대주택", "공동주택", "오피스텔")


async def search(mode: str, keyword: str) -> dict:
    return sample.search(keyword) if mode == "sample" else await juso.search(keyword)


def is_main(b: dict) -> bool:
    return not b.get("mainAtchGbCdNm") or "주건축물" in b["mainAtchGbCdNm"]


def public_checks(address: dict, buildings: dict, land: dict) -> list[dict]:
    """공공자료로 알 수 있는 지원 대상 조건. status: pass | fail | unknown"""
    checks = []

    def add(key, label, status, detail):
        checks.append({"key": key, "label": label, "status": status, "detail": detail})

    add("busan", "부산광역시 소재", "pass" if is_busan(address.get("admCd")) else "fail",
        "법정동코드 앞자리 26" if is_busan(address.get("admCd")) else "부산광역시 주소가 아닙니다.")
    if address.get("bdKdcd") == "1":
        add("type", "단독·다가구주택", "fail", "공동주택(아파트·연립·다세대) 호실은 대상이 아닙니다.")
    elif not buildings["ok"]:
        add("type", "단독·다가구주택", "unknown", f"건축물대장 확인 불가: {buildings['error']['message']}")
    else:
        main = [b for b in buildings["data"] if is_main(b)]
        collective = any("집합" in (b.get("regstrKindCdNm") or "") or any(c in (b.get("mainPurpsCdNm") or "") for c in COLLECTIVE)
                         for b in buildings["data"])
        detached = any((b.get("mainPurpsCd") or "").startswith("01") for b in main)
        if collective:
            add("type", "단독·다가구주택", "fail", "집합건축물·공동주택입니다.")
        elif detached:
            add("type", "단독·다가구주택", "pass", ", ".join(dict.fromkeys(b.get("mainPurpsCdNm") or "" for b in main)))
        else:
            add("type", "단독·다가구주택", "fail", f"주용도: {', '.join(dict.fromkeys(b.get('mainPurpsCdNm') or '미상' for b in main))}")

    # 분석 범위와 공적 자료 일치
    if buildings["ok"]:
        main = [b for b in buildings["data"] if is_main(b)]
        bylot = any((b.get("bylotCnt") or 0) > 0 for b in buildings["data"])
        if len(main) > 1 or bylot:
            add("scope", "분석할 건물·필지 범위", "unknown",
                ("주건축물 여러 개" if len(main) > 1 else "") + (" · 다른 필지(외필지)에 걸친 건물" if bylot else "") + " — 범위 확인 필요")
        else:
            add("scope", "분석할 건물·필지 범위", "pass", "주건축물 1개, 단일 필지")
        plat = next((b.get("platArea") for b in main if b.get("platArea")), None)
        if land["ok"] and plat and land["data"].get("lndpclAr"):
            diff = abs(plat - land["data"]["lndpclAr"]) / land["data"]["lndpclAr"]
            add("consistency", "건축물대장·토지정보 일치", "pass" if diff <= 0.05 else "fail",
                f"대지면적 {plat:g}㎡ / 토지면적 {land['data']['lndpclAr']:g}㎡" + ("" if diff <= 0.05 else " — 차이가 커서 범위 확인 필요"))
        else:
            add("consistency", "건축물대장·토지정보 일치", "unknown", "비교할 면적 정보가 부족합니다.")
    else:
        add("scope", "분석할 건물·필지 범위", "unknown", "건축물대장을 확인하지 못했습니다.")
        add("consistency", "건축물대장·토지정보 일치", "unknown", "건축물대장을 확인하지 못했습니다.")
    return checks


async def lookup(mode: str, address: dict) -> dict:
    if mode == "sample":
        known = next((a for a in sample.ADDRESSES if a["id"] == address.get("id")), None)
        if not known:
            raise ValueError("알 수 없는 예시 주소입니다.")
        address = known
    pnu = address.get("pnu")
    if not pnu:
        raise ValueError("지번(법정동코드·본번·부번)이 없어 필지를 특정할 수 없습니다.")
    sgg = pnu[:5]
    base_months = trades.recent_months(12, today_kst())
    ext_months = trades.recent_months(24, today_kst())

    if mode == "sample":
        results = (sample.buildings(pnu), sample.characteristics(pnu), sample.land_use(pnu),
                   sample.trades("house", ext_months), sample.trades("land", ext_months),
                   {"ok": False, "data": None, "error": {"kind": "no_result", "message": "예시 모드"}})
    else:
        results = await asyncio.gather(building.titles(pnu), vworld.characteristics(pnu), vworld.land_use(pnu),
                                       trades.collect("house", sgg, ext_months), trades.collect("land", sgg, ext_months),
                                       vworld.house_price(pnu))
    bld, land, use, house_trades, land_trades, house_price = results

    out = {
        "id": str(uuid.uuid4()), "mode": mode, "createdAt": now_iso(), "address": address, "pnu": pnu,
        "buildings": bld, "land": land, "landUse": use, "houseTrades": house_trades, "landTrades": land_trades,
        "housePrice": house_price,  # 개별주택가격(공시) — 시세 추정 보조 근거
        "months": {"base": base_months, "extended": ext_months},
        "mainBuildings": [b for b in bld["data"] if is_main(b)] if bld["ok"] else [],
        "checks": public_checks(address, bld, land),
    }
    with dbm.connect() as c:
        c.execute("INSERT INTO public_lookups VALUES (?, ?, ?, ?, ?)", (out["id"], mode, pnu, dbm.dumps(out), out["createdAt"]))
    return out


def get_lookup(lookup_id: str) -> dict | None:
    with dbm.connect() as c:
        row = c.execute("SELECT payload FROM public_lookups WHERE id = ?", (lookup_id,)).fetchone()
    return dbm.loads(row["payload"]) if row else None
