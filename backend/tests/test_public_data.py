"""공공 API 응답 해석. 오류 본문은 2026-10-21 실제 호출(잘못된 키)로 받은 것."""

import json
from datetime import date

from app import estimates
from app.labels import won
from app.public_data import (
    address_from_juso, parse_data_go_kr, parse_vworld_land, recent_months, to_parcel, trade_from_item,
)

GATEWAY_JSON = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR","returnAuthMsg":"등록되지 않은 서비스키","returnReasonCode":"30"}}}'
GATEWAY_XML = '<?xml version="1.0" encoding="UTF-8"?><OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg><returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'


def test_공공데이터포털_인증오류_JSON_XML():
    for body in (GATEWAY_JSON, GATEWAY_XML):
        r = parse_data_go_kr(body, 403, "t")
        assert not r["ok"] and r["error"]["kind"] == "auth"


def test_호출제한():
    assert parse_data_go_kr(GATEWAY_JSON.replace('"30"', '"22"'), 200, "t")["error"]["kind"] == "rate_limit"


def test_정상_단건과_결과없음():
    one = parse_data_go_kr('{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":{"a":"1"}}}}}', 200, "t")
    assert one["items"] == [{"a": "1"}]
    none = parse_data_go_kr('{"response":{"header":{"resultCode":"00"},"body":{"items":""}}}', 200, "t")
    assert none["items"] == []


def test_실거래가_XML_해석():
    xml = ("<response><header><resultCode>000</resultCode></header><body><items>"
           "<item><dealAmount>  85,000</dealAmount><plottageAr>165.2</plottageAr><dealYear>2026</dealYear>"
           "<dealMonth>3</dealMonth><dealDay>7</dealDay><buildYear>1900</buildYear><cdealType></cdealType></item>"
           "<item><dealAmount>70,000</dealAmount><cdealType>O</cdealType><buildYear>1992</buildYear></item>"
           "</items></body></response>")
    trades = [trade_from_item(i) for i in parse_data_go_kr(xml, 200, "t")["items"]]
    assert trades[0]["amountWon"] == 850_000_000  # 만원 → 원
    assert trades[0]["dealDate"] == "2026-03-07"
    assert trades[0]["buildYear"] is None  # 실제 자료의 1900은 미상
    assert trades[1]["cancelled"] and trades[1]["landArea"] is None and trades[1]["buildYear"] == 1992


def test_브이월드_오류와_최신연도_선택():
    err = parse_vworld_land('{"landCharacteristicss" : {"resultCode" : "INCORRECT_KEY", "resultMsg" : "x"}}')
    assert err["error"]["kind"] == "auth"
    rows = [{"stdrYear": "2025", "stdrMt": "07", "pblntfPclnd": "1"}, {"stdrYear": "2026", "stdrMt": "01", "pblntfPclnd": "3"},
            {"stdrYear": "2025", "stdrMt": "01", "pblntfPclnd": "2"}]
    r = parse_vworld_land(json.dumps({"landCharacteristicss": {"resultCode": "", "field": rows}}))
    assert r["data"]["pblntfPclnd"] == 3
    assert "lndpclAr" in r["meta"]["missingFields"]


def test_주소에서_PNU_만들기():
    p = to_parcel(address_from_juso({"admCd": "1111010100", "mtYn": "1", "lnbrMnnm": "12", "lnbrSlno": "3"}))
    assert p == {"admCd": "1111010100", "sigunguCd": "11110", "bjdongCd": "10100", "platGbCd": "1",
                 "bun": "0012", "ji": "0003", "pnu": "1111010100200120003"}


def test_조회월():
    assert recent_months(3, date(2026, 1, 15)) == ["202512", "202511", "202510"]


def test_비교사례_선정과_보류():
    t = {"kind": "house", "umdNm": "가동", "landArea": 100, "floorArea": 100, "amountWon": 500_000_000,
         "buildYear": 1990, "cancelled": False, "dealingGbn": "중개거래"}
    subject = {"landArea": 100, "floorArea": 100, "buildYear": 1990, "umdNm": "가동"}
    r = estimates.estimate_from_trades(subject, [t, {**t, "cancelled": True}, {**t, "dealingGbn": "직거래"}, {**t, "landArea": 300}])
    assert r["range"] is None and "미만" in r["withheldReason"]
    assert [d["reason"] for d in r["decisions"] if not d["included"]] == ["해제된 거래", "직거래", "대지면적 차이 큼(3.00배)"]
    ok = estimates.estimate_from_trades({**subject, "landArea": 200, "floorArea": 150},
                                        [{**t, "amountWon": m * 100_000_000} for m in (4, 5, 6)])
    assert ok["range"] == {"low": 900_000_000, "base": 1_000_000_000, "high": 1_100_000_000}


def test_토지사례_없으면_보류_비용_합계():
    assert estimates.estimate_land_price({"landArea": 100}, None)["range"] is None
    d = estimates.estimate_demolition(100)
    assert d["total"]["base"] == sum(line["amount"]["base"] for line in d["lines"])
    assert estimates.estimate_demolition(None)["total"] is None


def test_금액표시():
    assert won(340_000_000) == "3억 4,000만 원"
    assert won(None) == "산정 불가"
    assert won(0) == "0원"


def test_토지사례는_대지만_지분거래_제외():
    base = {"umdNm": "가동", "landArea": 100, "amountWon": 500_000_000, "cancelled": False,
            "dealingGbn": "중개거래", "landUse": "대", "zoning": "제2종일반주거지역", "shareDeal": False}
    trades = [base, {**base, "amountWon": 600_000_000}, {**base, "amountWon": 400_000_000},
              {**base, "landUse": "도로"}, {**base, "shareDeal": True}]
    r = estimates.estimate_land_price({"landArea": 100, "umdNm": "가동", "zoning": "제2종일반주거지역"}, trades)
    assert r["sampleSize"] == 3 and r["range"]["base"] == 500_000_000


def test_리모델링_후_가치는_신축급_사례로만():
    t = {"umdNm": "가동", "landArea": 100, "floorArea": 100, "amountWon": 800_000_000, "cancelled": False, "dealingGbn": "중개거래"}
    old = [{**t, "buildYear": 1990, "amountWon": 400_000_000}] * 5
    new = [{**t, "buildYear": 2018}, {**t, "buildYear": 2020, "amountWon": 900_000_000}, {**t, "buildYear": 2022, "amountWon": 700_000_000}]
    subject = {"landArea": 100, "floorArea": 100, "buildYear": 1988, "umdNm": "가동"}
    r = estimates.estimate_remodeled_value(subject, old + new, 2026)
    assert r["sampleSize"] == 3 and r["range"]["base"] == 800_000_000
    assert estimates.estimate_remodeled_value(subject, old, 2026)["range"] is None


def test_토지_실거래_항목_해석():
    from app.public_data import land_trade_from_item
    t = land_trade_from_item({"dealAmount": "1,800", "dealArea": "3.31", "dealYear": "2026", "dealMonth": "9", "dealDay": "28",
                              "jimok": "도로", "landUse": "일반상업지역", "shareDealingType": "지분", "cdealType": " "})
    assert t["amountWon"] == 18_000_000 and t["landUse"] == "도로" and t["shareDeal"] and not t["cancelled"]


def test_일시_오류는_다시_시도하고_인증오류는_안함(monkeypatch):
    import asyncio
    from app import public_data as p
    monkeypatch.setattr(p, "RETRY_DELAYS", (0, 0))
    calls = {"n": 0}

    @p.retry_transient
    async def flaky():
        calls["n"] += 1
        return p.fail("upstream", "t", "서비스 연결실패 에러", "05") if calls["n"] < 3 else {"ok": True, "data": 1}

    assert asyncio.run(flaky())["ok"] and calls["n"] == 3

    calls["n"] = 0

    @p.retry_transient
    async def auth():
        calls["n"] += 1
        return p.fail("auth", "t", "키 오류")

    assert not asyncio.run(auth())["ok"] and calls["n"] == 1
