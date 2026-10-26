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
