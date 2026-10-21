"""계산 엔진 검증. 명세 예시는 가상 값(실제 부산 시세·비용 아님)."""

import pytest

from app.engine import (
    brokerage_cap, compare, cost_total, demolition_cost, evaluate, ev_range, scenario, support_amount, winner,
)

만 = 10_000


def test_명세_예시():
    r = scenario(H=100_000_000, L=160_000_000, D=20_000_000, CH=3_000_000, CL=6_000_000, G=0,
                 MH_fixed=500_000, ML_fixed=1_000_000)
    assert r["K"] == 59_500_000
    assert r["D_star"] == 56_500_000
    assert r["N_H"] == 96_500_000
    assert r["N_L"] == 133_000_000
    assert r["delta"] == 36_500_000
    assert r["delta"] == r["D_star"] - r["D"]


def test_손익분기_음수면_철거비_0원이어도_철거_불리():
    r = scenario(H=100_000_000, L=101_000_000, D=0, CH=0, CL=5_000_000, G=0, MH_fixed=500_000, ML_fixed=1_000_000)
    assert r["D_star"] < 0 and r["delta"] < 0


def test_동률():
    r = scenario(H=100, L=100, D=0, CH=0, CL=0, G=0, MH_fixed=0, ML_fixed=0)
    assert winner(r["delta"]) == "tie"


def test_중개보수는_가격에_연동되고_구간_경계를_반영():
    assert brokerage_cap(199_999_999, land=False) == 800_000   # 한도
    assert brokerage_cap(200_000_000, land=False) == 800_000   # 0.4%
    assert brokerage_cap(900_000_000, land=False) == pytest.approx(4_500_000)  # 0.5% 구간 시작
    assert brokerage_cap(100_000_000, land=True) == pytest.approx(900_000)
    a = scenario(H=100_000_000, L=160_000_000, D=0, CH=0, CL=0, G=0)
    b = scenario(H=110_000_000, L=160_000_000, D=0, CH=0, CL=0, G=0)
    assert a["M_H"] == pytest.approx(500_000) and b["M_H"] == pytest.approx(550_000)


def test_미확인과_0원과_적용없음_구분():
    assert ev_range({"kind": "unknown"}) is None
    assert ev_range({"kind": "consult", "value": 0}) == (0, 0)
    assert ev_range({"kind": "none"}) == (0, 0)
    c = cost_total({"tax": {"kind": "none"}, "holding": {"kind": "consult", "value": 100}})
    assert c["range"] == (100, 100) and set(c["missing"]) == {"금융비", "정리비", "기타"}


def test_범위_중첩과_민감도_역전():
    r = compare((95_000_000, 105_000_000), (125_000_000, 135_000_000), (20_000_000, 20_000_000), (0, 0), (0, 0), 0)
    assert r["overlap"] or r["consistentWinner"] in (None, "mixed")
    clear = compare((100_000_000,) * 2, (200_000_000,) * 2, (10_000_000,) * 2, (0, 0), (0, 0), 0)
    assert not clear["overlap"] and clear["consistentWinner"] == "demolish"
    assert len(clear["sensitivity"]) == 8


def test_견적_할증_중복_방지와_가정_시뮬레이션():
    q = demolition_cost({"quote": {"kind": "consult", "value": 30_000_000, "source": "A업체", "checkedOn": "2026-10-01",
                                   "items": {k: "included" for k in ("demolition", "waste", "equipment", "asbestos", "admin", "vat", "cleanup")}},
                         "simulation": {"unitPerPyeong": 500_000, "multiplier": 2.0}}, 100, "narrow")
    assert q["range"] == (30_000_000, 30_000_000) and q["basis"] == "quote" and not q["surchargeApplied"]
    s = demolition_cost({"simulation": {"unitPerPyeong": 500_000, "multiplier": 1.5, "multiplierShare": 0.4}}, 400 / 121 * 30, "narrow")
    assert s["basis"] == "assumption"
    assert round(s["range"][0]) == round(30 * 500_000 * (0.6 + 0.4 * 1.5))


def test_지원금_구분():
    s = support_amount([
        {"name": "A", "confirmed": True, "saleCompatible": True, "type": "cash", "confirmedAmount": 5_000_000, "payment": "post"},
        {"name": "B", "confirmed": False, "maxAmount": 20_000_000},
        {"name": "C", "confirmed": True, "saleCompatible": False, "type": "cash", "confirmedAmount": 9_000_000},
        {"name": "D", "confirmed": True, "saleCompatible": True, "type": "direct", "confirmedAmount": 7_000_000},
    ])
    assert s["G"] == 0  # 확정 지원이 여럿인데 중복수혜 확인이 없음
    one = support_amount([{"name": "A", "confirmed": True, "saleCompatible": True, "type": "cash", "confirmedAmount": 5_000_000, "payment": "post"}])
    assert one["G"] == 5_000_000 and one["prepaid"] == 0


ELIG_OK = {"amountRecommendationAllowed": True, "holdReasons": []}
ALL_ITEMS = {k: "included" for k in ("demolition", "waste", "equipment", "asbestos", "admin", "vat", "cleanup")}


def consult(v, kind):
    return {"kind": "consult", "value": v, "priceType": kind, "scopeMatches": True, "source": "○○공인중개사",
            "checkedOn": "2026-10-01", "siteConditionShared": True}


def full_inputs(**kw):
    costs = {p: {"kind": "consult", "value": 1_000_000} for p in ("tax", "holding", "finance", "cleanup", "other")}
    base = {"H": consult(100_000_000, "as_is"), "L": consult(200_000_000, "land"),
            "D": {"quote": {"kind": "consult", "value": 20_000_000, "source": "B업체", "checkedOn": "2026-10-02", "items": ALL_ITEMS}},
            "C_H": costs, "C_L": costs, "period_H": {"kind": "consult", "value": 3}, "period_L": {"kind": "consult", "value": 8}}
    return {**base, **kw}


def test_철거후_우세여도_선지출_불가면_실행_추천_안함():
    r = evaluate(full_inputs(funding={"prefund": "no"}), {"eligibility": ELIG_OK, "access": "good"})
    assert r["computedLeader"] == "demolish" and r["executionRecommendation"] is None and r["status"] == "hold"
    ok = evaluate(full_inputs(funding={"prefund": "yes", "available": 30_000_000}), {"eligibility": ELIG_OK, "access": "good"})
    assert ok["status"] == "conditional" and ok["executionRecommendation"] == "demolish"


def test_현상태_판매_추천에는_철거자금을_요구하지_않음():
    r = evaluate(full_inputs(L=consult(80_000_000, "land")), {"eligibility": ELIG_OK, "access": "good"})
    assert r["status"] == "conditional" and r["executionRecommendation"] == "sell_as_is"  # funding 입력 없음


def test_민감도_역전이면_우열_불확실():
    r = evaluate(full_inputs(L=consult(110_000_000, "land")), {"eligibility": ELIG_OK, "access": "good"})
    assert r["status"] == "uncertain" and r["executionRecommendation"] is None


def test_한쪽만_상담값이면_추천_보류():
    r = evaluate(full_inputs(L={"kind": "assumption", "value": 200_000_000}), {"eligibility": ELIG_OK, "access": "good"})
    assert r["status"] == "hold" and r["calc"] is not None  # 가정 계산은 제공


def test_정보부족은_현상태유지_결론이_아님():
    r = evaluate({}, {"eligibility": ELIG_OK, "access": "unknown"})
    assert r["status"] == "hold" and r["executionRecommendation"] is None


def test_같은_입력_같은_결과():
    a = evaluate(full_inputs(funding={"prefund": "yes", "available": 30_000_000}), {"eligibility": ELIG_OK, "access": "good"})
    b = evaluate(full_inputs(funding={"prefund": "yes", "available": 30_000_000}), {"eligibility": ELIG_OK, "access": "good"})
    assert a == b
