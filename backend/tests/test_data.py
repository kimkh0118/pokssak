"""식별자·단위·공공자료 해석·유사 거래 선정."""

import json
from datetime import date

from app import comps
from app.adapters.common import parse_data_go_kr
from app.adapters.juso import address_from_juso
from app.adapters.trades import house_from_item, land_from_item, recent_months
from app.adapters.vworld import parse_characteristics, parse_land_use
from app.codes import is_busan, manwon_to_won, parse_pnu, pnu_from_address, pyeong_to_sqm, sqm_to_pyeong, won


def test_PNU_조합과_산_구분():
    assert pnu_from_address("2650010400", "0", 734, 8) == "2650010400107340008"
    assert pnu_from_address("2650010400", "1", 12, 0) == "2650010400200120000"  # 산 → 2
    assert pnu_from_address("26500104", "0", 1, 0) is None
    p = parse_pnu("2650010400200120000")
    assert p["mountain"] and p["platGbCd"] == "1" and p["bun"] == "0012" and p["sigunguCd"] == "26500"


def test_주소_API는_지번으로_PNU를_만들고_건물번호는_쓰지않음():
    a = address_from_juso({"admCd": "2650010400", "mtYn": "0", "lnbrMnnm": "734", "lnbrSlno": "8", "buldMnnm": "19"})
    assert a["pnu"] == "2650010400107340008" and a["buldMnnm"] == 19


def test_단위와_부산():
    assert manwon_to_won(1_800) == 18_000_000
    assert round(pyeong_to_sqm(1), 4) == 3.3058 and round(sqm_to_pyeong(165.3), 1) == 50.0
    assert is_busan("2650010400") and not is_busan("1111010100")
    assert won(None) == "미확인" and won(0) == "0원"


def test_공공데이터포털_인증오류와_일시장애():
    gw = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnAuthMsg":"등록되지 않은 서비스키","returnReasonCode":"30"}}}'
    assert parse_data_go_kr(gw, 403, "t")["error"]["kind"] == "auth"
    assert parse_data_go_kr(gw.replace('"30"', '"05"'), 200, "t")["error"]["kind"] == "upstream"
    ok = parse_data_go_kr("<response><header><resultCode>000</resultCode></header><body><items><item><a>1</a></item></items>"
                          "<totalCount>2400</totalCount></body></response>", 200, "t")
    assert ok["totalCount"] == 2400 and ok["items"] == [{"a": "1"}]


def test_실거래_항목():
    h = house_from_item({"dealAmount": " 21,500", "plottageAr": "150.2", "dealYear": "2026", "dealMonth": "1", "dealDay": "12",
                         "buildYear": "1900", "cdealType": " "})
    assert h["amountWon"] == 215_000_000 and h["buildYear"] is None and not h["cancelled"] and h["dealDate"] == "2026-01-12"
    land = land_from_item({"dealAmount": "1,800", "dealArea": "3.31", "jimok": "도로", "shareDealingType": "지분", "cdealType": "O"})
    assert land["shareDeal"] and land["cancelled"] and land["jimok"] == "도로"
    assert recent_months(2, date(2026, 1, 5)) == ["202512", "202511"]


def test_브이월드_토지특성_토지이용계획():
    rows = [{"stdrYear": "2025", "stdrMt": "07", "lndpclAr": "1"}, {"stdrYear": "2026", "stdrMt": "01", "lndpclAr": "2"}]
    assert parse_characteristics(json.dumps({"landCharacteristicss": {"resultCode": "", "field": rows}}))["data"]["lndpclAr"] == 2
    lu = parse_land_use(json.dumps({"landUses": {"resultCode": "", "field": [{"prposAreaDstrcCodeNm": "도시지역", "cnflcAtNm": "포함"}]}}))
    assert lu["data"][0]["name"] == "도시지역"
    assert parse_land_use(json.dumps({"landUses": {"resultCode": "INCORRECT_KEY"}}))["error"]["kind"] == "auth"


SUBJECT = {"umdNm": "가동", "landArea": 100, "buildYear": 1985, "jimok": "대"}
T = {"kind": "house", "umdNm": "가동", "houseType": "단독", "landArea": 100, "floorArea": 80, "amountWon": 100_000_000,
     "buildYear": 1985, "cancelled": False, "dealingGbn": "중개거래", "shareDeal": False, "jibunMasked": "1**"}
MONTHS = ["202609", "202608", "202607"]


def ref(trades, failed=None):
    return comps.reference_price("house", {"ok": True, "data": trades, "failedMonths": failed or []}, SUBJECT, MONTHS, MONTHS)


def test_거래_0건_1건_여러건():
    assert ref([])["status"] == "withheld"
    one = ref([{**T, "dealDate": "2026-09-01"}])
    assert one["status"] == "single" and one["value"] == 100_000_000
    many = ref([{**T, "dealDate": "2026-09-01", "jibunMasked": "1**"}, {**T, "dealDate": "2026-08-01", "amountWon": 120_000_000},
                {**T, "dealDate": "2026-07-01", "amountWon": 80_000_000, "landArea": 110}])
    assert many["status"] == "median" and many["range"]["min"] < many["value"] < many["range"]["max"]


def test_제외_사유와_극단값은_지우지_않음():
    r = ref([{**T, "dealDate": "2026-09-01", "cancelled": True}, {**T, "dealDate": "2026-09-02", "landArea": 150},
             {**T, "dealDate": "2026-09-03", "buildYear": 2015}, {**T, "dealDate": "2026-09-04", "amountWon": 900_000_000},
             {**T, "dealDate": "2026-09-04", "amountWon": 900_000_000}])
    reasons = [d["reason"] for d in r["decisions"]]
    assert reasons[:3] == ["해제된 거래", "면적 비교 범위 밖(150%)", "건축연도 차이 30년"]
    assert r["sampleSize"] == 1 and reasons[4] == "중복 신고로 보이는 거래"  # 비싼 거래도 남김, 중복만 제외


def test_일부_조회실패는_0건이_아님():
    r = ref([], failed=["202608"])
    assert any("0건이 아니라 미확인" in n for n in r["notes"])
