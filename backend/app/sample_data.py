"""예시 데이터. 가상의 '예시시 예시구' 주소와 거래 사례이며 실제가 아니다.
사용자가 예시 모드를 직접 골랐을 때만 쓰고, 실제 API 실패를 이 데이터로 대체하지 않는다.
"""

from __future__ import annotations

SOURCE = "예시 데이터(가상의 주소·거래, 실제 아님)"


def _meta(note: str | None = None) -> dict:
    from .public_data import now
    return {"source": SOURCE, "provenance": "sample", "fetchedAt": now(), "asOf": "2026-10-01(예시)", "note": note}


def _address(id, road, jibun, adm, bun, ji, emd, bd_name=None, apartment=False) -> dict:
    return {"id": id, "roadAddr": road, "jibunAddr": jibun, "zipNo": "00000", "admCd": adm, "mtYn": "0",
            "lnbrMnnm": bun, "lnbrSlno": ji, "bdMgtSn": None, "bdNm": bd_name, "bdKdcd": "1" if apartment else "0",
            "siNm": "예시시", "sggNm": "예시구", "emdNm": emd, "provenance": "sample"}


ADDRESSES = [
    _address("sample-house", "예시시 예시구 예시로 12 (예시동)", "예시시 예시구 예시동 101-3", "9999910100", 101, 3, "예시동"),
    _address("sample-multi", "예시시 예시구 예시로 34 (예시동)", "예시시 예시구 예시동 205-7", "9999910100", 205, 7, "예시동", "예시빌"),
    _address("sample-two-bldg", "예시시 예시구 샘플길 7 (샘플동)", "예시시 예시구 샘플동 33-1", "9999910200", 33, 1, "샘플동"),
    _address("sample-apt", "예시시 예시구 예시로 56, 101동 1203호 (예시동, 예시아파트)", "예시시 예시구 예시동 300",
             "9999910100", 300, 0, "예시동", "예시아파트", apartment=True),
]


def _building(**kw) -> dict:
    base = {"mgmBldrgstPk": None, "regstrKindCdNm": "일반건축물", "mainAtchGbCdNm": "주건축물", "mainPurpsCd": "01000",
            "mainPurpsCdNm": "단독주택", "etcPurps": None, "strctCdNm": "벽돌구조", "totArea": None, "platArea": None,
            "archArea": None, "grndFlrCnt": None, "ugrndFlrCnt": 0, "useAprDay": None, "hhldCnt": 1, "fmlyCnt": 0,
            "bldNm": None, "dongNm": None, "platPlc": None, "newPlatPlc": None, "bylotCnt": 0}
    return {**base, **kw}


# 키: PNU
BUILDINGS = {
    "9999910100101010003": [_building(mgmBldrgstPk="S-1001", totArea=132.0, platArea=165.3, archArea=82.1, grndFlrCnt=2, useAprDay="19880615")],
    "9999910100102050007": [_building(mgmBldrgstPk="S-2001", mainPurpsCd="01003", mainPurpsCdNm="다가구주택", strctCdNm="철근콘크리트구조",
                                      totArea=396.8, platArea=231.4, archArea=134.5, grndFlrCnt=3, ugrndFlrCnt=1,
                                      useAprDay="19960320", fmlyCnt=8, bldNm="예시빌")],
    "9999910200100330001": [
        _building(mgmBldrgstPk="S-3001", totArea=89.2, platArea=198.0, grndFlrCnt=1, useAprDay="19790910", strctCdNm="목구조", dongNm="본동", bylotCnt=1),
        _building(mgmBldrgstPk="S-3002", totArea=45.6, platArea=198.0, grndFlrCnt=1, useAprDay="19920505", strctCdNm="블록구조", dongNm="별동", bylotCnt=1),
    ],
    "9999910100103000000": [_building(mgmBldrgstPk="S-4001", regstrKindCdNm="집합건축물", mainPurpsCd="02001", mainPurpsCdNm="아파트",
                                      strctCdNm="철근콘크리트구조", totArea=15230, platArea=9800, grndFlrCnt=15,
                                      useAprDay="20050301", hhldCnt=120, bldNm="예시아파트", dongNm="101동")],
}


def _land(pnu, mnnm, area, price, **kw) -> dict:
    base = {"pnu": pnu, "ldCodeNm": "예시시 예시구 예시동", "mnnmSlno": mnnm, "lndcgrCodeNm": "대", "lndpclAr": area,
            "prposArea1Nm": "제2종일반주거지역", "prposArea2Nm": "지정되지않음", "ladUseSittnNm": "단독",
            "roadSideCodeNm": "세로한면(가)", "pblntfPclnd": price, "stdrYear": "2026", "stdrMt": "01", "lastUpdtDt": "2026-07-31"}
    return {**base, **kw}


LAND = {
    "9999910100101010003": _land("9999910100101010003", "101-3", 165.3, 2_350_000),
    "9999910100102050007": _land("9999910100102050007", "205-7", 231.4, 2_620_000, ladUseSittnNm="다세대"),
    "9999910200100330001": _land("9999910200100330001", "33-1", 198.0, 1_980_000, ldCodeNm="예시시 예시구 샘플동", prposArea1Nm="제1종일반주거지역"),
    "9999910100103000000": _land("9999910100103000000", "300", 9800, 3_100_000, ladUseSittnNm="아파트"),
}

# (법정동, 대지㎡, 연면적㎡, 건축년도, 거래금액 만원, 계약일, 해제 여부, 거래유형, 주택유형)
HOUSE_TRADES = [
    ("예시동", 158.0, 120.5, 1986, 72_000, "2025-11-14", False, "중개거래", "단독"),
    ("예시동", 172.4, 140.2, 1990, 79_500, "2025-12-03", False, "중개거래", "단독"),
    ("예시동", 149.6, 98.3, 1983, 66_800, "2026-01-22", False, "중개거래", "단독"),
    ("예시동", 181.0, 150.0, 1992, 84_000, "2026-02-09", False, "중개거래", "단독"),
    ("예시동", 165.0, 128.7, 1988, 75_000, "2026-03-17", False, "직거래", "단독"),
    ("예시동", 140.2, 110.0, 1985, 64_000, "2026-04-02", False, "중개거래", "단독"),
    ("예시동", 190.5, 160.4, 1994, 89_000, "2026-05-28", True, "중개거래", "단독"),
    ("예시동", 168.8, 135.0, 1987, 77_800, "2026-06-11", False, "중개거래", "단독"),
    ("예시동", 410.0, 380.0, 1999, 175_000, "2026-07-05", False, "중개거래", "다가구"),
    ("예시동", 226.0, 380.2, 1997, 112_000, "2026-07-19", False, "중개거래", "다가구"),
    ("예시동", 240.3, 410.5, 1995, 118_500, "2026-08-08", False, "중개거래", "다가구"),
    ("예시동", 218.7, 360.0, 1998, 106_000, "2026-08-26", False, "중개거래", "다가구"),
    ("예시동", 235.0, 395.0, 1994, 115_000, "2026-09-12", False, "중개거래", "다가구"),
    ("예시동", 155.2, 118.0, 1975, 68_000, "2026-09-20", False, "중개거래", "단독"),
    ("샘플동", 201.0, 92.0, 1980, 69_000, "2025-12-15", False, "중개거래", "단독"),
    ("샘플동", 188.5, 101.4, 1984, 66_500, "2026-02-21", False, "중개거래", "단독"),
    ("샘플동", 210.2, 120.0, 1990, 74_800, "2026-04-18", False, "중개거래", "단독"),
    ("샘플동", 176.0, 88.0, 1978, 61_000, "2026-06-30", False, "중개거래", "단독"),
    ("샘플동", 220.0, 140.5, 1995, 79_000, "2026-08-14", False, "중개거래", "단독"),
]

# (법정동, 거래면적㎡, 거래금액 만원, 계약일) — 지목 '대'
LAND_TRADES = [
    ("예시동", 160.0, 83_000, "2025-12-20"), ("예시동", 175.5, 92_500, "2026-02-14"),
    ("예시동", 150.2, 77_000, "2026-04-25"), ("예시동", 182.0, 96_000, "2026-06-03"),
    ("예시동", 230.0, 122_000, "2026-07-29"), ("예시동", 210.0, 109_500, "2026-09-05"),
    ("샘플동", 195.0, 79_000, "2026-03-11"), ("샘플동", 205.0, 84_500, "2026-05-16"),
    ("샘플동", 188.0, 75_800, "2026-08-22"),
]

# 예시 모드 전용 리모델링 후 가치·월세 가정(공사비 대비 상승률로 만든 값이 아님)
REMODEL_ASSUMPTIONS = {
    "sample-house": {"price": {"low": 820_000_000, "base": 870_000_000, "high": 920_000_000},
                     "rent": {"low": 2_200_000, "base": 2_500_000, "high": 2_800_000}},
    "sample-multi": {"price": {"low": 1_180_000_000, "base": 1_260_000_000, "high": 1_330_000_000},
                     "rent": {"low": 5_600_000, "base": 6_200_000, "high": 6_800_000}},
    "sample-two-bldg": {"price": {"low": 760_000_000, "base": 810_000_000, "high": 860_000_000},
                        "rent": {"low": 1_900_000, "base": 2_150_000, "high": 2_400_000}},
}


def search(keyword: str) -> dict:
    q = keyword.replace(" ", "")
    hits = [a for a in ADDRESSES if q in (a["roadAddr"] + a["jibunAddr"] + (a["bdNm"] or "")).replace(" ", "")]
    return {"ok": True, "data": hits or ADDRESSES,
            "meta": _meta(None if hits else "예시 모드에서는 아래 예시 주소만 조회할 수 있습니다.")}


def buildings(pnu: str) -> dict:
    if pnu not in BUILDINGS:
        return {"ok": False, "error": {"kind": "no_result", "source": SOURCE, "message": "예시 건축물 정보 없음", "code": None}}
    return {"ok": True, "data": BUILDINGS[pnu], "meta": _meta()}


def land(pnu: str) -> dict:
    if pnu not in LAND:
        return {"ok": False, "error": {"kind": "no_result", "source": SOURCE, "message": "예시 토지 정보 없음", "code": None}}
    return {"ok": True, "data": LAND[pnu], "meta": {**_meta(), "missingFields": []}}


def house_trades(sgg: str) -> dict:
    data = [{"kind": "house", "sggCd": sgg, "umdNm": u, "houseType": ht, "jibunPartial": f"{i % 9 + 1}**",
             "landArea": la, "floorArea": fa, "dealDate": d, "amountWon": amt * 10_000, "buildYear": by,
             "cancelled": c, "dealingGbn": g}
            for i, (u, la, fa, by, amt, d, c, g, ht) in enumerate(HOUSE_TRADES)]
    return {"ok": True, "data": data, "meta": _meta("가상의 거래 사례"), "monthsQueried": [], "failedMonths": []}


def land_trades(sgg: str) -> dict:
    data = [{"kind": "land", "sggCd": sgg, "umdNm": u, "houseType": None, "jibunPartial": f"{i % 7 + 2}**",
             "landArea": a, "floorArea": None, "dealDate": d, "amountWon": amt * 10_000, "buildYear": None,
             "cancelled": False, "dealingGbn": "중개거래", "landUse": "대"}
            for i, (u, a, amt, d) in enumerate(LAND_TRADES)]
    return {"ok": True, "data": data, "meta": _meta("가상의 토지 거래 사례")}
