"""계산 엔진 검증. 명세의 예시: 할인율 0%, 기간 중 추가 수입·지출 없음, 기타 비용에 거래비·세금 포함."""

from dataclasses import replace

from app.analysis import EngineInput, analyze
from app.calculator import (
    Params, breakeven_price, housing_brokerage_cap, land_brokerage_cap,
    max_allowable_cost, rental_payback, simulate, solve_root,
)

억, 만 = 100_000_000, 10_000


def spec(**kw) -> Params:
    p = Params(
        horizon_months=36, discount_rate=0, occupancy="tenant",
        loan_balance=5000 * 만, loan_rate=0, tenant_deposit=2000 * 만, tenant_rent=0, lease_end_month=0,
        as_is_price=3 * 억, land_price=35000 * 만, demolition_cost=3000 * 만,
        demolition_prep=1, demolition_work=1, lead_as_is=3, lead_land=4,
        transaction_override={"asIsSale": 1000 * 만, "landSale": 2000 * 만, "remodelSale": None},
        tax_as_is=0, tax_land=0, tax_remodel=0,
    )
    return replace(p, **kw)


# ---- 명세 검증 예시 4개
def test_현상태_매각_순현금_2억2천():
    r = simulate("sell_as_is", spec())
    assert r["netCash"] == 22000 * 만
    assert r["saleSettlement"]["netProceeds"] == 22000 * 만


def test_철거후_매각_순현금_2억3천_대출보증금_한번씩():
    r = simulate("demolish_sell_land", spec())
    assert r["netCash"] == 23000 * 만
    assert [f["category"] for f in r["flows"]].count("loan") == 1
    assert [f["category"] for f in r["flows"]].count("deposit") == 1


def test_손익분기_매각가_3억4천():
    s = breakeven_price("demolish_sell_land", spec())
    assert s["ok"] and abs(s["value"] - 34000 * 만) < 2000


def test_철거비_상한_4천():
    s = max_allowable_cost("demolish_sell_land", spec())
    assert s["ok"] and abs(s["value"] - 4000 * 만) < 2000


# ---- 중복 계산 방지, 현금과 자산 구분
def test_보유하면_집값은_현금이_아니라_기간말_순자산():
    r = simulate("keep", spec())
    assert not any(f["category"] == "sale" for f in r["flows"])
    assert r["netCash"] == 0
    assert r["terminal"]["net"] == 22000 * 만  # 3억 − 처분비 1천만 − 대출 5천만 − 보증금 2천만


def test_매각하면_기간말_자산을_다시_더하지_않음():
    assert simulate("sell_as_is", spec())["terminal"] is None


def test_이자를_내도_원금은_한번만():
    r = simulate("keep", spec(loan_rate=0.06))
    interest = sum(f["amount"] for f in r["flows"] if f["category"] == "finance")
    assert round(interest) == -5000 * 만 * 0.06 * 3
    assert r["terminal"]["loan"] == 5000 * 만


# ---- 미입력과 0원 구분
def test_대출_미확인은_반영전으로_표시():
    assert "대출 잔액 반영 전(미확인)" in simulate("sell_as_is", spec(loan_balance=None))["pending"]
    assert "대출 잔액 반영 전(미확인)" not in simulate("sell_as_is", spec(loan_balance=0))["pending"]


def test_세금_미입력은_세금_반영전():
    r = simulate("sell_as_is", spec(tax_as_is=None))
    assert "세금 반영 전" in r["pending"]
    assert not any(f["category"] == "tax" for f in r["flows"])


def test_보증금_모름은_반영전():
    assert "임차보증금 반영 전(미확인)" in simulate("sell_as_is", spec(tenant_deposit=None))["pending"]


# ---- 근거 부족 시 산정 보류
def test_토지가_없으면_철거안_계산_안함():
    r = simulate("demolish_sell_land", spec(land_price=None))
    assert not r["computable"] and "토지" in r["missing"][0]


def test_해가_없으면_숫자를_만들지_않음():
    assert solve_root(lambda x: x + 1, 0, 10) is None
    assert not max_allowable_cost("demolish_sell_land", spec(land_price=2 * 억))["ok"]


def test_최대_선투입은_누적_최저점():
    # 0개월 보증금 −2천만, 2개월 철거비 −3천만 → −5천만
    assert simulate("demolish_sell_land", spec())["maxUpfront"] == 5000 * 만


def test_임대_회수기간은_추가_순수입_기준():
    ok = rental_payback(spec(remodel_cost=6000 * 만, remodel_rent=200 * 만, tenant_rent=100 * 만, remodel_vacancy=0))
    assert ok == {"ok": True, "value": 60, "extraMonthly": 100 * 만}
    assert not rental_payback(spec(remodel_cost=6000 * 만, remodel_rent=100 * 만, tenant_rent=100 * 만, remodel_vacancy=0))["ok"]


def test_중개보수_상한():
    assert housing_brokerage_cap(4000 * 만) == 240_000
    assert housing_brokerage_cap(1.9 * 억) == 800_000
    assert housing_brokerage_cap(3 * 억) == 1_200_000
    assert housing_brokerage_cap(10 * 억) == 5_000_000
    assert land_brokerage_cap(3 * 억) == 2_700_000


# ---- 추천 규칙
def flat(v):
    return {"low": v, "base": v, "high": v}


def engine(**kw) -> EngineInput:
    i = EngineInput(
        purpose="best_price", timing="flexible", occupancy="tenant", discount_rate=0,
        available_cash=1 * 억, loan_balance=5000 * 만, loan_rate=0, tenant_deposit=2000 * 만,
        tenant_rent=0, lease_end_month=0, holding_cost=0, maintenance_as_is=0, remodel_maintenance=0,
        as_is_price={"low": 2.8 * 억, "base": 3 * 억, "high": 3.2 * 억},
        land_price={"low": 3.3 * 억, "base": 3.5 * 억, "high": 3.7 * 억},
        demolition_cost=flat(3000 * 만), demolition_prep=flat(1), demolition_work=flat(1),
        remodel_cost=flat(8000 * 만), lead_as_is=flat(3), lead_land=flat(4), lead_remodeled=flat(3),
        transaction_override={"asIsSale": 1000 * 만, "landSale": 2000 * 만, "remodelSale": None},
        tax_as_is=0, tax_land=0, tax_remodel=0,
    )
    return replace(i, **kw)


def option(res, oid):
    return next(o for o in res["options"] if o["id"] == oid)


def test_차이가_범위보다_작으면_추가_견적_필요():
    assert analyze(engine())["recommendation"]["verdict"] == "needs_quotes"


def test_예산_초과는_추천하지_않음():
    res = analyze(engine(available_cash=1000 * 만, land_price=flat(4.6 * 억), as_is_price=flat(3 * 억)))
    assert option(res, "demolish_sell_land")["checks"]["budget"] == "exceeds"
    assert res["recommendation"]["optionId"] != "demolish_sell_land"


def test_정보_부족은_현상태_유지가_아니라_판단_보류():
    res = analyze(engine(as_is_price=None, land_price=None, purpose="undecided"))
    assert res["recommendation"]["verdict"] == "insufficient_info"
    assert res["recommendation"]["optionId"] is None


def test_본인거주_대체주거비_없으면_판단_보류():
    res = analyze(engine(occupancy="owner", purpose="undecided", remodel_price={"low": 3.3 * 억, "base": 3.6 * 억, "high": 3.9 * 억}))
    assert res["recommendation"]["verdict"] == "insufficient_info"


def test_빠른_매각은_3개월_넘는_철거안_제외():
    res = analyze(engine(purpose="quick_sale", timing="within_3m"))
    assert option(res, "demolish_sell_land")["checks"]["timing"] == "exceeds"


def test_계산_못한_선택지가_있으면_강한_추천_안함():
    res = analyze(engine(land_price=None, as_is_price=flat(3 * 억)))
    rec = res["recommendation"]
    assert rec["verdict"] == "recommend" and rec["strength"] != "strong"
    assert "비교에서 빠졌습니다" in " ".join(rec["cautions"])
