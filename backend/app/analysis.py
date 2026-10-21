"""4개 선택지 × 3개 시나리오를 계산하고 추천을 정한다.

추천 순서: 목적 부합 → 예산·희망 시점 → 실행 가능·미확인 조건 → 같은 기준 경제성 → 불확실성으로 강도 결정.
'현상태 유지 추천'과 '정보 부족으로 판단 보류'는 다른 결과다.
업체 수수료·제휴 여부는 입력에 없으므로 순위에 영향을 줄 수 없다.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone

from .calculator import (
    Params, baseline_for, breakeven_price, max_allowable_cost, rental_payback, simulate,
)
from .labels import OPTION_LABEL, REMODEL_VARIANT_LABEL, TIMING_MONTHS, VERDICT_LABEL, won

Range = dict  # {"low": float, "base": float, "high": float}
SCENARIOS = ("conservative", "base", "optimistic")


@dataclass
class EngineInput:
    """계산 입력. 가격·비용·기간은 범위(Range), 나머지는 값 하나. None 은 미확인."""

    purpose: str
    timing: str
    occupancy: str
    condition: str = "unknown"
    horizon_months: int = 36
    discount_rate: float = 0.035
    price_growth: float = 0.0
    available_cash: float | None = None
    loan_balance: float | None = None
    loan_rate: float | None = None
    tenant_deposit: float | None = None
    tenant_rent: float | None = None
    lease_end_month: int | None = None
    replacement_housing: float | None = None
    holding_cost: float = 100_000
    maintenance_as_is: float = 150_000
    as_is_price: Range | None = None
    land_price: Range | None = None
    remodel_price: Range | None = None
    remodel_rent: Range | None = None
    remodel_vacancy: float = 0.05
    remodel_maintenance: float = 100_000
    demolition_cost: Range | None = None
    demolition_prep: Range = field(default_factory=lambda: {"low": 1, "base": 2, "high": 4})
    demolition_work: Range = field(default_factory=lambda: {"low": 1, "base": 1, "high": 2})
    remodel_cost: Range | None = None
    remodel_prep: Range = field(default_factory=lambda: {"low": 1, "base": 2, "high": 3})
    remodel_work: Range = field(default_factory=lambda: {"low": 2, "base": 3, "high": 4})
    lead_as_is: Range = field(default_factory=lambda: {"low": 2, "base": 4, "high": 7})
    lead_land: Range = field(default_factory=lambda: {"low": 3, "base": 5, "high": 9})
    lead_remodeled: Range = field(default_factory=lambda: {"low": 2, "base": 4, "high": 7})
    transaction_extra: float = 0
    transaction_override: dict = field(default_factory=lambda: {"asIsSale": None, "landSale": None, "remodelSale": None})
    tax_as_is: float | None = None
    tax_land: float | None = None
    tax_remodel: float | None = None


def scenario_params(i: EngineInput, key: str) -> Params:
    """보수적: 낮은 가격·높은 비용·긴 기간 / 낙관적: 반대. 통계적 확률 구간이 아니라 가정의 폭이다."""
    price_pick = {"conservative": "low", "base": "base", "optimistic": "high"}[key]
    cost_pick = {"conservative": "high", "base": "base", "optimistic": "low"}[key]

    def price(r):
        return None if r is None else r[price_pick]

    def cost(r):
        return None if r is None else r[cost_pick]

    def months(r):
        return round(r[cost_pick])

    return Params(
        horizon_months=i.horizon_months, discount_rate=i.discount_rate, price_growth=i.price_growth,
        occupancy=i.occupancy, loan_balance=i.loan_balance, loan_rate=i.loan_rate,
        tenant_deposit=i.tenant_deposit, tenant_rent=i.tenant_rent, lease_end_month=i.lease_end_month,
        replacement_housing=i.replacement_housing, holding_cost=i.holding_cost,
        maintenance_as_is=i.maintenance_as_is,
        as_is_price=price(i.as_is_price), land_price=price(i.land_price),
        remodel_price=price(i.remodel_price), remodel_rent=price(i.remodel_rent),
        remodel_vacancy=i.remodel_vacancy, remodel_maintenance=i.remodel_maintenance,
        demolition_cost=cost(i.demolition_cost), demolition_prep=months(i.demolition_prep),
        demolition_work=months(i.demolition_work), remodel_cost=cost(i.remodel_cost),
        remodel_prep=months(i.remodel_prep), remodel_work=months(i.remodel_work),
        lead_as_is=months(i.lead_as_is), lead_land=months(i.lead_land), lead_remodeled=months(i.lead_remodeled),
        transaction_extra=i.transaction_extra, transaction_override=i.transaction_override,
        tax_as_is=i.tax_as_is, tax_land=i.tax_land, tax_remodel=i.tax_remodel,
    )


def _confirmations(option_id: str, i: EngineInput) -> list[str]:
    items = ["등기부등본 권리관계(근저당·가압류 등) 확인"]
    if i.occupancy == "tenant":
        items.append({"sell_as_is": "임차인 승계 또는 계약 종료 협의", "keep": "임대차 갱신 조건"}
                     .get(option_id, "임차인 계약 종료·명도 일정 협의(계약갱신요구권 등)"))
    if i.occupancy == "unknown":
        items.append("현재 사용 상황(거주자·임차인 여부)")
    if option_id == "demolish_sell_land":
        items += ["해체(철거) 허가·신고 및 석면 조사 대상 여부",
                  "철거 후 신축 가능 여부(도로 접면·건축선·용도지역 제한)",
                  "토지 매수 수요와 실제 토지 거래가(현장 확인)"]
    if option_id == "remodel":
        items += ["구조 안전 확인(사용자가 입력한 상태는 안전진단 결과가 아님)",
                  "대수선·용도변경 해당 여부와 인허가",
                  "리모델링 후 가치·임대료에 대한 현장 시세 확인"]
    if option_id == "keep" and i.condition == "major_repair":
        items.append("대규모 보수 필요 상태: 안전 점검과 보수 견적")
    return items


def analyze(i: EngineInput) -> dict:
    def run(variant: str) -> dict:
        return {k: simulate(variant, scenario_params(i, k)) for k in SCENARIOS}

    base_params = scenario_params(i, "base")

    # 리모델링 방식: 목적에 맞춰 고르고, 미정이면 계산 가능한 방식 중 비교가치가 가장 큰 방식
    remodel_runs = {v: run(v) for v in ("remodel_sell", "remodel_rent", "remodel_live")}
    remodel_variant = {"rent": "remodel_rent", "live": "remodel_live",
                       "quick_sale": "remodel_sell", "best_price": "remodel_sell"}.get(i.purpose)
    if remodel_variant is None:
        usable = [v for v, r in remodel_runs.items()
                  if r["base"]["computable"] and not (v == "remodel_live" and i.occupancy != "owner")]
        usable.sort(key=lambda v: -remodel_runs[v]["base"]["comparisonValue"])
        remodel_variant = usable[0] if usable else "remodel_sell"

    keep_label = {"tenant": "현 임대 유지", "owner": "현 상태로 계속 거주"}.get(i.occupancy, "현 상태로 보유")
    rows = [
        ("sell_as_is", "sell_as_is", "현상태로 매각"),
        ("demolish_sell_land", "demolish_sell_land", "철거 후 토지 매각"),
        ("remodel", remodel_variant, REMODEL_VARIANT_LABEL[remodel_variant]),
        ("keep", "keep", keep_label),
    ]
    sell_base = simulate("sell_as_is", base_params)

    options = []
    for option_id, variant, variant_label in rows:
        scenarios = remodel_runs[variant] if variant.startswith("remodel_") else run(variant)
        b = scenarios["base"]
        is_alternative = option_id in ("demolish_sell_land", "remodel")
        pending = []
        for k in SCENARIOS:
            for x in scenarios[k]["pending"]:
                if x not in pending:
                    pending.append(x)
        options.append({
            "id": option_id,
            "variant": variant,
            "label": OPTION_LABEL[option_id],
            "variantLabel": variant_label,
            "scenarios": scenarios,
            "computable": b["computable"],
            "missing": b["missing"],
            "pending": pending,
            "vsSellAsIs": (b["comparisonValue"] - sell_base["comparisonValue"])
            if b["computable"] and sell_base["computable"] else None,
            "breakevenPrice": breakeven_price(variant, base_params) if is_alternative else None,
            "maxAllowableCost": max_allowable_cost(variant, base_params) if is_alternative else None,
            "rentalPayback": rental_payback(base_params) if variant == "remodel_rent" else None,
            "baselineLabel": ("현상태 유지" if baseline_for(variant) == "keep" else "현상태 매각") if is_alternative else None,
            "checks": {},
            "needsConfirmation": _confirmations(option_id, i),
            "remodelAlternatives": [
                {"variant": v, "label": REMODEL_VARIANT_LABEL[v], "computable": r["base"]["computable"],
                 "comparisonValue": r["base"]["comparisonValue"] if r["base"]["computable"] else None,
                 "missing": r["base"]["missing"]}
                for v, r in remodel_runs.items()
            ] if option_id == "remodel" else None,
        })

    recommendation = recommend(options, i)
    global_pending = []
    for o in options:
        for x in o["pending"]:
            if x not in global_pending:
                global_pending.append(x)

    return {
        "options": options,
        "recommendation": recommendation,
        "globalPending": global_pending,
        "assumptionsNote": [
            f"공통 비교 기간 {i.horizon_months}개월, 연 할인율 {i.discount_rate * 100:.1f}%, "
            f"연 가격변동률 {i.price_growth * 100:.1f}% (모두 수정 가능한 가정)",
            "비교가치 = 각 월 순현금흐름의 현재가치 합계 + 비교 기간 말 보유 순자산의 현재가치",
            "대출은 이자만 내다가 매각·기간 말에 원금을 정산한다고 가정",
            "보수적·기준·낙관적 범위는 가정의 폭이며 통계적으로 검증된 확률이 아님",
            "업체 수수료나 제휴 여부는 계산·순위에 쓰이지 않음",
        ],
        "computedAt": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------- 추천 규칙
PURPOSE_FIT = {
    "quick_sale": {"sell_as_is": "fit", "demolish_sell_land": "partial", "remodel": "partial", "keep": "mismatch"},
    "best_price": {"sell_as_is": "fit", "demolish_sell_land": "fit", "remodel": "fit", "keep": "mismatch"},
    "live": {"sell_as_is": "mismatch", "demolish_sell_land": "mismatch", "remodel": "fit", "keep": "fit"},
    "rent": {"sell_as_is": "mismatch", "demolish_sell_land": "mismatch", "remodel": "fit", "keep": "fit"},
    "undecided": {"sell_as_is": "fit", "demolish_sell_land": "fit", "remodel": "fit", "keep": "fit"},
}


def _moves_out(o: dict) -> bool:
    """본인 거주 시 집을 떠나야 하는 선택지(대체 주거비가 필요한지)."""
    return o["variant"] not in ("keep", "remodel_live")


def _half_range(o: dict) -> float:
    lo, hi = o["scenarios"]["conservative"], o["scenarios"]["optimistic"]
    if not (lo["computable"] and hi["computable"]):
        return float("inf")
    return abs(hi["comparisonValue"] - lo["comparisonValue"]) / 2


def _result(verdict, option_id, strength, headline, reasons, cautions):
    return {"verdict": verdict, "optionId": option_id, "strength": strength,
            "headline": headline, "reasons": reasons, "cautions": cautions}


def recommend(options: list[dict], i: EngineInput) -> dict:
    limit = TIMING_MONTHS[i.timing]

    # 1~3단계: 선택지별 점검
    for o in options:
        b = o["scenarios"]["base"]
        timing = "na"
        if o["id"] != "keep" and b["computable"]:
            timing = "ok" if limit is None or b["completionMonth"] <= limit else "exceeds"
        budget = "ok"
        if b["computable"] and b["maxUpfront"] > 0:
            if i.available_cash is None:
                budget = "unknown"
            elif b["maxUpfront"] > i.available_cash:
                budget = "exceeds"
        checks = {"purposeFit": PURPOSE_FIT[i.purpose][o["id"]], "timing": timing, "budget": budget}
        if not b["computable"]:
            checks["excludedReason"] = "계산 불가: " + ", ".join(b["missing"])
        elif checks["purposeFit"] == "mismatch":
            checks["excludedReason"] = "선택한 활용 목적과 맞지 않음"
        elif timing == "exceeds":
            checks["excludedReason"] = f"희망 시점({limit}개월) 안에 실행 완료가 어려움"
        elif budget == "exceeds":
            checks["excludedReason"] = (f"최대 선투입 필요액 {won(b['maxUpfront'])}이 "
                                        f"투입 가능 현금 {won(i.available_cash)}을 넘음")
        o["checks"] = checks

    purpose_ok = [o for o in options if o["checks"]["purposeFit"] != "mismatch"]
    computable = [o for o in purpose_ok if o["computable"]]
    candidates = [o for o in computable if "excludedReason" not in o["checks"]]

    if not computable:
        missing = []
        for o in purpose_ok:
            missing += [m for m in o["missing"] if m not in missing]
        return _result("insufficient_info", None, None, "목적에 맞는 선택지를 계산할 정보가 부족해 판단을 보류합니다.",
                       missing or ["주요 가격 정보가 없습니다."],
                       ["정보 부족은 '현상태 유지가 최선'이라는 뜻이 아닙니다. 아래 항목을 보완하면 다시 계산할 수 있습니다."])

    if not candidates:
        return _result("no_feasible", None, None, "현재 예산·희망 시점 조건으로 실행 가능한 선택지가 없습니다.",
                       [f"{o['label']}: {o['checks']['excludedReason']}" for o in computable],
                       ["희망 시점이나 투입 가능 자금 조건을 조정하면 결과가 달라질 수 있습니다."])

    # 본인 거주 + 대체 주거비 미입력이면 '떠나는 선택'과 '머무는 선택' 사이 금전 순위를 정할 수 없다
    mixes = any(_moves_out(o) for o in candidates) and any(not _moves_out(o) for o in candidates)
    if i.occupancy == "owner" and i.replacement_housing is None and mixes and i.purpose in ("live", "undecided"):
        return _result("insufficient_info", None, None,
                       "거주를 계속하는 선택과 집을 떠나는 선택을 금전적으로 비교하려면 대체 주거비가 필요합니다.",
                       ["매각하거나 공사하는 동안 살 곳의 비용(월세 등)이 입력되지 않았습니다.",
                        "'계산 조건 수정'에서 월 대체 주거비를 입력하면 순위를 계산합니다."],
                       ["판단 보류는 현상태 유지 추천이 아닙니다."])

    # 4단계: 기준 시나리오 비교가치로 정렬
    ranked = sorted(candidates, key=lambda o: -o["scenarios"]["base"]["comparisonValue"])
    top, second = ranked[0], (ranked[1] if len(ranked) > 1 else None)
    tb = top["scenarios"]["base"]
    reasons = [f"같은 기준({i.horizon_months}개월, 할인율 {i.discount_rate * 100:.1f}%)으로 비교했을 때 "
               f"비교가치가 가장 큽니다: {won(tb['comparisonValue'])}."]
    if second:
        reasons.append(f"다음 선택지({second['label']})보다 {won(tb['comparisonValue'] - second['scenarios']['base']['comparisonValue'])} 많습니다.")
    if tb["maxUpfront"] > 0:
        reasons.append(
            f"최대 {won(tb['maxUpfront'])}의 선투입이 필요하지만 투입 가능 현금이 입력되지 않아 실행 가능 여부를 확정하지 못했습니다."
            if i.available_cash is None else
            f"최대 선투입 필요액 {won(tb['maxUpfront'])}은 투입 가능 현금 {won(i.available_cash)} 이내입니다.")
    cautions = [f"{o['label']} 제외: {o['checks']['excludedReason']}"
                for o in options if "excludedReason" in o["checks"] and o["id"] != top["id"]]

    # 5단계: 불확실성
    diff = tb["comparisonValue"] - second["scenarios"]["base"]["comparisonValue"] if second else float("inf")
    band = max(_half_range(top), _half_range(second)) if second else _half_range(top)
    if second and diff < band:
        return _result("needs_quotes", top["id"], "weak",
                       f"선두는 '{top['variantLabel']}'이지만, 다음 선택지와의 차이({won(diff)})가 "
                       f"추정 범위(±{won(band)})보다 작아 추가 견적·확인이 필요합니다.",
                       reasons, cautions)

    major_pending = [p for p in top["pending"] if not p.startswith("세금")]
    assumed_price = top["id"] in ("remodel", "demolish_sell_land")  # 대안 가격·공사비는 가정인 경우가 많다
    uncomputed = [o for o in purpose_ok if not o["computable"]]
    strong = (diff >= 2 * band and not major_pending and top["checks"]["budget"] == "ok"
              and not assumed_price and not uncomputed)
    strength = "strong" if strong else "moderate"

    if uncomputed:
        cautions.insert(0, f"{', '.join(o['label'] for o in uncomputed)}은(는) 정보가 부족해 비교에서 빠졌습니다. "
                           "'계산 조건 수정'에서 시세·견적을 넣으면 함께 비교합니다.")
    if top["checks"]["budget"] == "unknown":
        cautions.append("투입 가능 현금이 미입력이라 실행 가능 여부가 확정되지 않았습니다.")
    if major_pending:
        cautions.append("반영하지 못한 항목: " + ", ".join(major_pending))
    if assumed_price:
        cautions.append("대안의 매각가·공사비는 견적과 현장 시세로 확인해야 하는 가정입니다.")
    if any(p.startswith("세금") for p in top["pending"]):
        cautions.append("모든 금액은 세금 반영 전입니다.")

    headline = f"추천: {top['variantLabel']}" if strong else f"우선 검토 권장: {top['variantLabel']}"
    return _result("recommend", top["id"], strength, headline, reasons, cautions)


