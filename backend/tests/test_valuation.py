"""중개사 방식 추정: 개별요인 보정, 같은 용도지역 토지 거래, 원가법의 철거 부담, 공시가격 비율, 결합."""

from datetime import date

from app import valuation

MONTHS = {"base": ["202610", "202609"], "extended": ["202610", "202609", "202510"]}
LAND = {"roadSideCodeNm": "세로한면(가)", "tpgrphFrmCodeNm": "부정형", "tpgrphHgCodeNm": "평지", "pblntfPclnd": 1_000_000,
        "prposArea1Nm": "제2종일반주거지역", "lndcgrCodeNm": "대"}
SUBJECT = {"umdNm": "우동", "landArea": 100, "buildYear": 1980, "jimok": "대"}


def land_trade(unit, zoning="제2종일반주거", area=100, d="2026-10-01"):
    return {"kind": "land", "umdNm": "우동", "jimok": "대", "zoning": zoning, "landArea": area, "amountWon": unit * area,
            "dealDate": d, "cancelled": False, "shareDeal": False}


def test_land_factor_penalizes_narrow_road_and_irregular_shape():
    f, items = valuation.land_factor(LAND)
    assert round(f, 3) == round(0.93 * 0.93 * 1.0, 3) and len(items) == 3


def test_land_unit_uses_same_zoning_only():
    trades = {"ok": True, "data": [land_trade(2_000_000), land_trade(2_200_000), land_trade(9_000_000, zoning="일반상업")]}
    lu = valuation.land_unit_price(trades, SUBJECT | {"zoning": "제2종일반주거지역"}, MONTHS["base"], MONTHS["extended"])
    assert lu["n"] == 2 and lu["unit"] == 2_100_000 and "같은 용도지역" in lu["note"]


def test_estimate_combines_three_methods_and_old_house_burden():
    trades = {"ok": True, "data": [land_trade(2_000_000), land_trade(2_200_000)]}
    house_ref = {"decisions": [{"included": True, "unitPrice": 1_800_000, "trade": {"buildYear": 1985}} for _ in range(3)]}
    building = {"totArea": 80, "strctCdNm": "벽돌구조"}
    hp = {"ok": True, "data": {"stdrYear": "2026", "housePc": 90_000_000}}
    out = valuation.estimate(SUBJECT, LAND, building, house_ref, trades, hp, MONTHS, date(2026, 10, 26))
    names = {m["key"]: m for m in out["house"]["methods"]}
    assert set(names) == {"comparable", "cost", "official"}
    assert "철거 부담" in names["cost"]["detail"]  # 46년 된 벽돌집 → 매수자가 철거 부담을 깎음
    assert names["official"]["value"] == 90_000_000 * 2.1  # 시세/공시 = 210만/100만
    lo, hi = out["house"]["range"]["min"], out["house"]["range"]["max"]
    assert lo <= out["house"]["value"] <= hi
    assert out["land"]["value"] and out["house"]["value"] < out["land"]["value"] * 1.05  # 낡은 집은 땅값 수준


def test_no_data_returns_none():
    out = valuation.estimate(SUBJECT, {}, None, {}, {"ok": False}, None, MONTHS, date(2026, 10, 26))
    assert out["house"]["value"] is None and out["land"]["value"] is None


def test_road_names_from_vworld():
    assert valuation._road_factor("세로한면(불)")[0] == 0.85
    assert valuation._road_factor("세로각지(가)")[0] == 0.96
    assert valuation._road_factor("중로각지")[0] == 1.11
    assert valuation._road_factor("광대로-중로")[0] == 1.18
    assert valuation._road_factor("맹지")[0] == 0.70


def test_trend_official_and_quarterly():
    from app import trend
    land = {"history": [{"year": 2021, "price": 700_000}, {"year": 2026, "price": 800_000}]}
    hp = {"ok": True, "data": {"history": [{"year": 2021, "price": 90_000_000}, {"year": 2026, "price": 81_000_000}]}}
    o = trend.official(land, hp, 100)
    assert o["points"][0] == {"year": 2021, "house": 90_000_000, "land": 70_000_000}
    assert o["change"]["house5"]["pct"] == -10.0 and o["change"]["land5"]["pct"] == 14.3
    ht = {"ok": True, "data": [{"umdNm": "우동", "amountWon": 200_000_000, "landArea": 100, "dealDate": "2026-02-01"},
                               {"umdNm": "우동", "amountWon": 300_000_000, "landArea": 100, "dealDate": "2026-03-01"},
                               {"umdNm": "다른동", "amountWon": 900_000_000, "landArea": 100, "dealDate": "2026-03-01"}]}
    t = trend.trades(ht, {"ok": False}, {"umdNm": "우동", "jimok": "대"})
    assert t["points"] == [{"quarter": "2026-Q1", "houseUnit": 2_500_000, "houseN": 2, "landUnit": None, "landN": 0}]


def test_trend_keeps_empty_quarters():
    from app import trend
    ht = {"ok": True, "data": [{"umdNm": "우동", "amountWon": 200_000_000, "landArea": 100, "dealDate": "2026-01-10"}]}
    t = trend.trades(ht, {"ok": False}, {"umdNm": "우동"}, ["202510", "202511", "202601"])
    assert [p["quarter"] for p in t["points"]] == ["2025-Q4", "2026-Q1"] and t["points"][0]["houseUnit"] is None


def test_demolition_estimate_items():
    from app import demolition
    b = {"totArea": 80, "strctCdNm": "벽돌구조", "grndFlrCnt": 1, "useAprDay": "19780512", "archArea": 80, "roofCdNm": "슬레이트"}
    e = demolition.estimate(b, {"access": "none", "usage": "storage", "condition": "old"}, 2026)
    labels = [i["label"] for i in e["items"]]
    assert labels[0] == "철거·운반·폐기물" and "슬레이트 지붕 해체·처리" in labels and "해체 신고" in labels
    assert "남은 짐·가구 정리" in labels and "차량 진입 곤란 할증" in labels
    assert 8_000_000 < e["min"] < e["max"] < 25_000_000
    small = demolition.estimate({"totArea": 20, "strctCdNm": "목조"}, {"access": "good"}, 2026)
    assert small["items"][0]["min"] == 3_500_000  # 최소 기본 비용
    big = demolition.estimate({"totArea": 600, "strctCdNm": "철근콘크리트", "grndFlrCnt": 4, "ugrndFlrCnt": 1}, {"access": "good"}, 2026)
    assert any(i["label"] == "해체 허가·감리" for i in big["items"])
    assert demolition.estimate({}, {}, 2026) is None


def test_kakao_local_distance():
    from app.adapters import kakao_local as kl
    d = kl.distance_m((129.0403, 35.1150), (129.0403, 35.1240))  # 위도 0.009도 ≈ 1km
    assert 990 < d < 1010
