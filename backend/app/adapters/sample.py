"""예시 데이터. '예시구' 등 가상의 주소·거래이며 실제가 아니다.
사용자가 예시 모드를 고른 경우에만 쓰고, 실제 API 실패를 이 데이터로 바꾸지 않는다.
시군구코드 26999 는 실제로 없는 코드다(부산 접두어 26만 맞춤)."""

from __future__ import annotations

from ..clock import now_iso

SOURCE = "예시 데이터(가상의 주소·거래, 실제 아님)"


def _meta(note=None) -> dict:
    return {"source": SOURCE, "provenance": "sample", "fetchedAt": now_iso(), "asOf": "2026-10-01(예시)", "note": note}


def _addr(id, road, jibun, adm, bun, ji, emd, apt=False, bd=None, sgg="예시구"):
    from ..codes import pnu_from_address
    return {"id": id, "roadAddr": road, "jibunAddr": jibun, "admCd": adm, "mtYn": "0", "lnbrMnnm": bun, "lnbrSlno": ji,
            "buldMnnm": None, "bdMgtSn": None, "bdNm": bd, "bdKdcd": "1" if apt else "0", "siNm": "부산광역시(예시)",
            "sggNm": sgg, "emdNm": emd, "pnu": pnu_from_address(adm, "0", bun, ji), "provenance": "sample"}


ADDRESSES = [
    _addr("sample-vacant", "부산광역시(예시) 예시구 바다로 12", "예시구 바다동 101-3", "2699910100", 101, 3, "바다동"),
    _addr("sample-few", "부산광역시(예시) 예시구 산복로 45", "예시구 산복동 77", "2699910200", 77, 0, "산복동"),
    _addr("sample-two", "부산광역시(예시) 예시구 골목길 7", "예시구 바다동 33-1", "2699910100", 33, 1, "바다동"),
    _addr("sample-apt", "부산광역시(예시) 예시구 바다로 56, 101동 1203호", "예시구 바다동 300", "2699910100", 300, 0, "바다동", apt=True, bd="예시아파트"),
]


def _b(**kw):
    base = {"mgmBldrgstPk": None, "regstrKindCdNm": "일반건축물", "mainAtchGbCdNm": "주건축물", "mainPurpsCd": "01000",
            "mainPurpsCdNm": "단독주택", "strctCdNm": "벽돌구조", "platArea": None, "totArea": None, "grndFlrCnt": 1,
            "ugrndFlrCnt": 0, "useAprDay": None, "dongNm": None, "bylotCnt": 0, "platPlc": None, "crtnDay": "20260901"}
    return {**base, **kw}


BUILDINGS = {
    "2699910100101010003": [_b(mgmBldrgstPk="S-1", platArea=165.3, totArea=92.4, grndFlrCnt=2, useAprDay="19820615")],
    "2699910200100770000": [_b(mgmBldrgstPk="S-2", mainPurpsCd="01003", mainPurpsCdNm="다가구주택", platArea=120.0, totArea=160.2,
                               grndFlrCnt=3, useAprDay="19910410", strctCdNm="철근콘크리트구조")],
    "2699910100100330001": [_b(mgmBldrgstPk="S-3", platArea=198.0, totArea=70.1, useAprDay="19750910", dongNm="본채", bylotCnt=1),
                            _b(mgmBldrgstPk="S-4", platArea=198.0, totArea=24.6, useAprDay="19880505", dongNm="별채", bylotCnt=1)],
    "2699910100103000000": [_b(mgmBldrgstPk="S-5", regstrKindCdNm="집합건축물", mainPurpsCd="02001", mainPurpsCdNm="아파트",
                               platArea=9800, totArea=15230, grndFlrCnt=15, useAprDay="20050301")],
}


def _land(pnu, area, price, **kw):
    base = {"pnu": pnu, "lndcgrCodeNm": "대", "lndpclAr": area, "prposArea1Nm": "제2종일반주거지역", "prposArea2Nm": None,
            "ladUseSittnNm": "단독", "roadSideCodeNm": "세로한면(가)", "tpgrphHgCodeNm": "완경사", "tpgrphFrmCodeNm": "세로장방",
            "pblntfPclnd": price, "stdrYear": "2026", "stdrMt": "01", "lastUpdtDt": "2026-07-31"}
    return {**base, **kw}


LAND = {
    "2699910100101010003": _land("2699910100101010003", 165.3, 1_450_000),
    "2699910200100770000": _land("2699910200100770000", 120.0, 980_000, roadSideCodeNm="세로각지(불)", tpgrphHgCodeNm="급경사"),
    "2699910100100330001": _land("2699910100100330001", 198.0, 1_320_000),
    "2699910100103000000": _land("2699910100103000000", 9800, 2_100_000, ladUseSittnNm="아파트"),
}
LAND_USE = [{"name": "도시지역", "code": "UQA01X", "conflict": "포함", "updated": "2026-09-01"},
            {"name": "제2종일반주거지역", "code": "UQA122", "conflict": "포함", "updated": "2026-09-01"},
            {"name": "가축사육제한구역", "code": "UDX200", "conflict": "포함", "updated": "2026-09-01"}]

# (법정동, 대지㎡, 연면적㎡, 건축년도, 만원, 계약일, 해제, 거래유형)
HOUSE_TRADES = [
    ("바다동", 150.2, 88.0, 1984, 21_500, "2026-01-12", False, "중개거래"),
    ("바다동", 172.0, 95.5, 1979, 23_800, "2026-03-05", False, "중개거래"),
    ("바다동", 160.8, 101.0, 1987, 24_900, "2026-05-21", False, "중개거래"),
    ("바다동", 181.3, 110.2, 1990, 27_000, "2026-07-02", False, "직거래"),
    ("바다동", 140.0, 80.0, 1983, 19_000, "2026-08-18", True, "중개거래"),
    ("바다동", 155.0, 90.0, 1976, 20_200, "2025-12-03", False, "중개거래"),
    ("바다동", 300.0, 250.0, 2015, 88_000, "2026-04-09", False, "중개거래"),
    ("바다동", 166.0, 99.0, 1981, 22_100, "2024-12-11", False, "중개거래"),   # 12개월 밖(24개월 확대 집단)
    ("산복동", 118.0, 150.0, 1993, 19_800, "2026-06-15", False, "중개거래"),
]
# (법정동, 거래면적㎡, 만원, 계약일, 지목, 지분거래)
LAND_TRADES = [
    ("바다동", 158.0, 26_800, "2026-02-14", "대", False),
    ("바다동", 175.0, 30_100, "2026-04-25", "대", False),
    ("바다동", 149.0, 24_600, "2026-06-03", "대", False),
    ("바다동", 190.0, 33_500, "2026-08-22", "대", False),
    ("바다동", 60.0, 9_000, "2026-05-10", "대", True),
    ("바다동", 165.0, 4_000, "2026-03-03", "도로", False),
]


def search(keyword: str) -> dict:
    q = keyword.replace(" ", "")
    hits = [a for a in ADDRESSES if q in (a["roadAddr"] + a["jibunAddr"] + (a["bdNm"] or "")).replace(" ", "")]
    return {"ok": True, "data": hits or ADDRESSES, "meta": _meta(None if hits else "예시 모드에서는 아래 예시 주소만 조회됩니다.")}


def _found(table, pnu, what):
    if pnu not in table:
        return {"ok": False, "error": {"kind": "no_result", "source": SOURCE, "message": f"예시 {what} 정보 없음", "code": None}}
    return {"ok": True, "data": table[pnu], "meta": _meta()}


def buildings(pnu):
    return _found(BUILDINGS, pnu, "건축물")


def characteristics(pnu):
    r = _found(LAND, pnu, "토지")
    if r["ok"]:
        r["meta"]["missingFields"] = []
    return r


def land_use(pnu):
    return {"ok": True, "data": LAND_USE, "meta": _meta()} if pnu in LAND else _found({}, pnu, "토지이용계획")


def trades(kind: str, months: list[str]) -> dict:
    allowed = set(months)
    if kind == "house":
        data = [{"kind": "house", "umdNm": u, "houseType": "단독", "jibunMasked": f"{i % 9 + 1}**", "landArea": la, "floorArea": fa,
                 "dealDate": d, "amountWon": a * 10_000, "buildYear": by, "cancelled": c, "dealingGbn": g, "shareDeal": False}
                for i, (u, la, fa, by, a, d, c, g) in enumerate(HOUSE_TRADES)]
    else:
        data = [{"kind": "land", "umdNm": u, "jibunMasked": f"{i % 7 + 2}**", "landArea": la, "jimok": j, "zoning": "제2종일반주거지역",
                 "dealDate": d, "amountWon": a * 10_000, "cancelled": False, "dealingGbn": "중개거래", "shareDeal": s}
                for i, (u, la, a, d, j, s) in enumerate(LAND_TRADES)]
    data = [t for t in data if t["dealDate"][:7].replace("-", "") in allowed]
    return {"ok": True, "data": data, "meta": _meta("가상의 거래 사례"), "monthsQueried": months, "failedMonths": []}
