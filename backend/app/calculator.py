"""선택지별 월 현금흐름·비교가치·손익분기점 계산.

원칙
- 현금 수지(실제로 오가는 돈)와 보유 순자산(팔지 않은 집 가치 − 부채)을 나눈다.
- 대출·임차보증금은 시나리오마다 한 번만 정산한다.
- 대출은 이자만 내다가 매각·기간 말에 원금을 정산한다고 가정한다.
- 값이 None 이면 '미확인'이다. 0으로 바꾸지 않고 pending(반영 전 항목)에 기록한다.
- 같은 입력이면 같은 결과가 나오는 순수 함수만 둔다.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

# ---------------------------------------------------------------- 중개보수
BROKERAGE_RULE_SOURCE = (
    "공인중개사법 시행규칙 별표1 주택 매매 중개보수 상한요율(2021.10.19 시행), "
    "주택 외(토지) 상한 0.9% — 상한 기준 추정, 부가세 별도"
)

# (이 금액 미만, 요율, 한도)
_HOUSING_BRACKETS = [
    (50_000_000, 0.006, 250_000),
    (200_000_000, 0.005, 800_000),
    (900_000_000, 0.004, None),
    (1_200_000_000, 0.005, None),
    (1_500_000_000, 0.006, None),
    (float("inf"), 0.007, None),
]


def housing_brokerage_cap(price: float) -> int:
    if price <= 0:
        return 0
    for below, rate, cap in _HOUSING_BRACKETS:
        if price < below:
            fee = price * rate
            return round(min(fee, cap) if cap is not None else fee)
    return 0


def land_brokerage_cap(price: float) -> int:
    return round(price * 0.009) if price > 0 else 0


def transaction_cost(price: float, sale_kind: str, extra_fixed: float, override: dict) -> float:
    """sale_kind: asIsSale | landSale | remodelSale. override 값이 있으면 그대로 쓴다."""
    if override.get(sale_kind) is not None:
        return override[sale_kind]
    fee = land_brokerage_cap(price) if sale_kind == "landSale" else housing_brokerage_cap(price)
    return fee + extra_fixed


# ---------------------------------------------------------------- 입력값
@dataclass
class Params:
    """한 시나리오(보수적/기준/낙관적)의 확정된 입력값. 금액은 원, 기간은 개월."""

    horizon_months: int = 36
    discount_rate: float = 0.035
    price_growth: float = 0.0
    occupancy: str = "vacant"  # owner | tenant | vacant | unknown
    loan_balance: float | None = None
    loan_rate: float | None = None
    tenant_deposit: float | None = None
    tenant_rent: float | None = None
    lease_end_month: int | None = None
    replacement_housing: float | None = None
    holding_cost: float = 0
    maintenance_as_is: float = 0
    as_is_price: float | None = None
    land_price: float | None = None
    remodel_price: float | None = None
    remodel_rent: float | None = None
    remodel_vacancy: float = 0.05
    remodel_maintenance: float = 0
    demolition_cost: float | None = None
    demolition_prep: int = 2
    demolition_work: int = 1
    remodel_cost: float | None = None
    remodel_prep: int = 2
    remodel_work: int = 3
    lead_as_is: int = 4
    lead_land: int = 5
    lead_remodeled: int = 4
    transaction_extra: float = 0
    transaction_override: dict = field(default_factory=lambda: {"asIsSale": None, "landSale": None, "remodelSale": None})
    tax_as_is: float | None = None
    tax_land: float | None = None
    tax_remodel: float | None = None


FLOW_LABELS = {
    "sale": "매각대금",
    "transaction": "중개·거래비용",
    "tax": "세금(입력값)",
    "loan": "대출 원금 정산",
    "deposit": "임차보증금 반환·정산",
    "execution": "철거·리모델링 실행비용",
    "holding": "보유비",
    "maintenance": "유지관리비",
    "finance": "대출이자",
    "rent": "임대수입",
    "housing": "대체·임시 주거비",
}


def present_value(amount: float, month: int, rate: float) -> float:
    return amount / (1 + rate) ** (month / 12)


# ---------------------------------------------------------------- 시뮬레이션
class _Sim:
    """한 선택지의 월별 현금흐름을 쌓는 도우미."""

    def __init__(self, p: Params):
        self.p = p
        self.flows: list[dict] = []
        self.pending: list[str] = []

    def note(self, text: str):
        if text not in self.pending:
            self.pending.append(text)

    def add(self, month: int, amount: float, category: str, label: str):
        if amount:
            self.flows.append({"month": month, "amount": amount, "category": category, "label": label})

    def grown(self, price: float, month: int) -> float:
        return price * (1 + self.p.price_growth) ** (month / 12)

    # 미확인 값은 0으로 계산하되 '반영 전'으로 표시
    def loan(self) -> float:
        if self.p.loan_balance is None:
            self.note("대출 잔액 반영 전(미확인)")
            return 0
        return self.p.loan_balance

    def deposit(self) -> float:
        if self.p.occupancy != "tenant":
            return 0
        if self.p.tenant_deposit is None:
            self.note("임차보증금 반영 전(미확인)")
            return 0
        return self.p.tenant_deposit

    def rent(self) -> float:
        if self.p.occupancy != "tenant":
            return 0
        if self.p.tenant_rent is None:
            self.note("현재 월 임대료 반영 전(미확인)")
            return 0
        return self.p.tenant_rent

    def tax(self, value: float | None) -> float | None:
        if value is None:
            self.note("세금 반영 전")
        return value

    def vacate_month(self) -> int:
        """임차인이 있으면 계약 종료 시점부터 공사를 시작할 수 있다."""
        if self.p.occupancy != "tenant":
            return 0
        if self.p.lease_end_month is None:
            self.note("임대차 종료 시점 미확인(즉시 명도 가정)")
            return 0
        return max(0, self.p.lease_end_month)

    # 월별 반복 항목
    def holding_and_interest(self, start: int, end: int):
        p = self.p
        for t in range(start, end + 1):
            self.add(t, -p.holding_cost, "holding", "보유비(가정)")
            if p.loan_balance:
                if p.loan_rate is None:
                    self.note("대출이자 반영 전(금리 미확인)")
                else:
                    self.add(t, -p.loan_balance * p.loan_rate / 12, "finance", "대출이자(이자만 상환 가정)")

    def repeat(self, start: int, end: int, amount: float, category: str, label: str):
        for t in range(start, end + 1):
            self.add(t, amount, category, label)

    def replacement_housing(self, start: int, end: int, label: str):
        if self.p.occupancy != "owner" or start > end:
            return
        if self.p.replacement_housing is None:
            self.note("대체·임시 주거비 반영 전(미입력)")
            return
        self.repeat(start, end, -self.p.replacement_housing, "housing", label)

    def spread_cost(self, start: int, months: int, total: float, label: str):
        n = max(1, months)
        first = start if months <= 0 else start + 1
        for i in range(n):
            self.add(first + i, -total / n, "execution", label)

    def sell(self, month: int, price: float, kind: str, tax: float | None, settle_deposit: bool) -> dict:
        p = self.p
        sale = self.grown(price, month)
        fee = transaction_cost(sale, kind, p.transaction_extra, p.transaction_override)
        t = self.tax(tax)
        loan = self.loan()
        fixed = p.transaction_override.get(kind) is not None
        self.add(month, sale, "sale", "매각대금")
        self.add(month, -fee, "transaction", "거래비용(사용자 입력 고정값)" if fixed else "중개보수 상한 추정 + 기타 거래비")
        if t is not None:
            self.add(month, -t, "tax", "세금(사용자 입력)")
        self.add(month, -loan, "loan", "대출 원금 정산")
        deposit = 0
        if settle_deposit:
            deposit = self.deposit()
            self.add(month, -deposit, "deposit", "임차보증금 매매대금에서 정산")
        return {"sale": sale, "fee": fee, "tax": t, "loan": loan, "deposit": deposit}

    def finish(self, option: str, completion: int, execution_cost: float, sale: dict | None = None,
               sale_month: int | None = None, prior_deposit: float = 0, terminal: dict | None = None) -> dict:
        p = self.p
        H = p.horizon_months
        monthly = [0.0] * (H + 1)
        for f in self.flows:
            monthly[f["month"]] += f["amount"]
        net_cash = sum(monthly)
        pv_cash = sum(present_value(v, t, p.discount_rate) for t, v in enumerate(monthly))

        cumulative, lowest = 0.0, 0.0
        for v in monthly:
            cumulative += v
            lowest = min(lowest, cumulative)

        terminal_out = None
        if terminal:
            value = self.grown(terminal["value"], H)
            disposal = transaction_cost(value, terminal["kind"], p.transaction_extra, p.transaction_override)
            tax = self.tax(terminal["tax"])
            loan = self.loan()
            net = value - disposal - (tax or 0) - loan - terminal["deposit"]
            terminal_out = {
                "propertyValue": value, "disposalCost": disposal, "tax": tax, "loan": loan,
                "deposit": terminal["deposit"], "net": net, "pv": present_value(net, H, p.discount_rate),
            }

        settlement = None
        if sale and sale_month is not None:
            holding = -sum(f["amount"] for f in self.flows
                           if f["month"] <= sale_month and f["category"] in ("holding", "finance", "maintenance"))
            deposit = sale["deposit"] + prior_deposit
            settlement = {
                "month": sale_month, "price": sale["sale"], "transaction": sale["fee"], "tax": sale["tax"],
                "loan": sale["loan"], "deposit": deposit, "executionCost": execution_cost,
                "holdingAndFinance": holding,
                "netProceeds": sale["sale"] - execution_cost - holding - sale["fee"] - (sale["tax"] or 0) - sale["loan"] - deposit,
            }

        return {
            "option": option, "computable": True, "missing": [], "pending": self.pending,
            "flows": self.flows, "netCash": net_cash, "pvCash": pv_cash, "terminal": terminal_out,
            "comparisonValue": pv_cash + (terminal_out["pv"] if terminal_out else 0),
            "saleSettlement": settlement, "completionMonth": completion,
            "executionCost": execution_cost, "maxUpfront": max(0.0, -lowest), "monthlyNet": monthly,
        }


def _not_computable(option: str, missing: list[str], pending: list[str] | None = None) -> dict:
    return {
        "option": option, "computable": False, "missing": missing, "pending": pending or [],
        "flows": [], "netCash": 0, "pvCash": 0, "terminal": None, "comparisonValue": 0,
        "saleSettlement": None, "completionMonth": 0, "executionCost": 0, "maxUpfront": 0, "monthlyNet": [],
    }


def simulate(option: str, p: Params) -> dict:
    """option: sell_as_is | demolish_sell_land | remodel_sell | remodel_rent | remodel_live | keep"""
    s = _Sim(p)
    H = p.horizon_months
    if p.occupancy == "unknown":
        s.note("사용 상황 미확인(공실로 가정)")

    if option == "sell_as_is":
        if p.as_is_price is None:
            return _not_computable(option, ["현상태 매각가 추정 근거 부족(유사 거래 사례 부족)"])
        m = round(p.lead_as_is)
        if m > H:
            return _not_computable(option, [f"예상 매각 시점({m}개월)이 비교 기간({H}개월)을 넘음"])
        s.holding_and_interest(1, m)
        s.repeat(1, m, -p.maintenance_as_is, "maintenance", "현 건물 유지관리비(가정)")
        s.repeat(1, m, s.rent(), "rent", "기존 임대료")
        sale = s.sell(m, p.as_is_price, "asIsSale", p.tax_as_is, settle_deposit=True)
        s.replacement_housing(m + 1, H, "매각 후 대체 주거비")
        return s.finish(option, m, 0, sale, m)

    if option == "demolish_sell_land":
        missing = []
        if p.land_price is None:
            missing.append("철거 후 토지 매각가 근거 부족(토지 거래 사례 또는 전문가 의견 필요)")
        if p.demolition_cost is None:
            missing.append("철거비 추정 불가(연면적 정보 없음)")
        if missing:
            return _not_computable(option, missing)
        start = s.vacate_month()
        work_start = start + round(p.demolition_prep)
        work_end = work_start + round(p.demolition_work)
        sale_month = work_end + round(p.lead_land)
        if sale_month > H:
            return _not_computable(option, [f"예상 매각 시점({sale_month}개월)이 비교 기간({H}개월)을 넘음"], s.pending)
        s.repeat(1, start, s.rent(), "rent", "기존 임대료(계약 종료까지)")
        deposit = s.deposit()
        s.add(start, -deposit, "deposit", "임차보증금 반환(명도)")
        s.holding_and_interest(1, sale_month)
        s.repeat(1, work_start, -p.maintenance_as_is, "maintenance", "현 건물 유지관리비(가정)")
        s.spread_cost(work_start, round(p.demolition_work), p.demolition_cost, "철거 실행비용(공사·폐기물·부대·예비비)")
        s.replacement_housing(work_start + 1, H, "철거 이후 대체 주거비")
        sale = s.sell(sale_month, p.land_price, "landSale", p.tax_land, settle_deposit=False)
        return s.finish(option, sale_month, p.demolition_cost, sale, sale_month, prior_deposit=deposit)

    if option in ("remodel_sell", "remodel_rent", "remodel_live"):
        missing = []
        if p.remodel_cost is None:
            missing.append("리모델링 비용 추정 불가(연면적 정보 없음)")
        if p.remodel_price is None:
            missing.append("리모델링 후 가치 근거 없음 — '계산 조건 수정'에서 가정값을 입력해야 계산됩니다")
        if option == "remodel_rent" and p.remodel_rent is None:
            missing.append("리모델링 후 예상 월 임대료 미입력")
        if missing:
            return _not_computable(option, missing)
        start = s.vacate_month()
        work_start = start + round(p.remodel_prep)
        work_end = work_start + round(p.remodel_work)
        s.repeat(1, start, s.rent(), "rent", "기존 임대료(계약 종료까지)")
        deposit = s.deposit()
        s.add(start, -deposit, "deposit", "임차보증금 반환(명도)")
        s.repeat(1, work_start, -p.maintenance_as_is, "maintenance", "현 건물 유지관리비(가정)")
        s.spread_cost(work_start, round(p.remodel_work), p.remodel_cost, "리모델링 실행비용(공사·폐기물·부대·예비비)")

        if option == "remodel_sell":
            sale_month = work_end + round(p.lead_remodeled)
            if sale_month > H:
                return _not_computable(option, [f"예상 매각 시점({sale_month}개월)이 비교 기간({H}개월)을 넘음"], s.pending)
            s.holding_and_interest(1, sale_month)
            s.repeat(work_end + 1, sale_month, -p.remodel_maintenance, "maintenance", "리모델링 후 유지관리비(가정)")
            s.replacement_housing(work_start + 1, H, "공사 중 임시거주·매각 후 대체 주거비")
            sale = s.sell(sale_month, p.remodel_price, "remodelSale", p.tax_remodel, settle_deposit=False)
            return s.finish(option, sale_month, p.remodel_cost, sale, sale_month, prior_deposit=deposit)

        if work_end > H:
            return _not_computable(option, [f"공사 완료 시점({work_end}개월)이 비교 기간({H}개월)을 넘음"], s.pending)
        s.holding_and_interest(1, H)
        s.repeat(work_end + 1, H, -p.remodel_maintenance, "maintenance", "리모델링 후 유지관리비(가정)")
        if option == "remodel_rent":
            s.repeat(work_end + 1, H, p.remodel_rent * (1 - p.remodel_vacancy), "rent", "리모델링 후 임대료(공실률 반영)")
            s.note("신규 임차인 보증금 미반영(월세 기준 계산)")
            s.replacement_housing(work_start + 1, H, "공사 중 임시거주·이후 대체 주거비")
        else:
            s.replacement_housing(work_start + 1, work_end, "공사 중 임시거주비")
        terminal = {"value": p.remodel_price, "tax": p.tax_remodel, "kind": "remodelSale", "deposit": 0}
        return s.finish(option, work_end, p.remodel_cost, prior_deposit=deposit, terminal=terminal)

    if option == "keep":
        if p.as_is_price is None:
            return _not_computable(option, ["보유 부동산 가치 추정 근거 부족(유사 거래 사례 부족)"])
        s.holding_and_interest(1, H)
        s.repeat(1, H, -p.maintenance_as_is, "maintenance", "현 건물 유지관리비(가정)")
        if p.occupancy == "tenant":
            s.repeat(1, H, s.rent(), "rent", "기존 임대료(같은 조건 갱신 가정)")
        terminal = {"value": p.as_is_price, "tax": p.tax_as_is, "kind": "asIsSale", "deposit": s.deposit()}
        return s.finish(option, 0, 0, terminal=terminal)

    raise ValueError(f"알 수 없는 선택지: {option}")


# ---------------------------------------------------------------- 손익분기점
PRICE_FIELD = {"demolish_sell_land": "land_price", "remodel_sell": "remodel_price",
               "remodel_rent": "remodel_price", "remodel_live": "remodel_price"}
COST_FIELD = {"demolish_sell_land": "demolition_cost", "remodel_sell": "remodel_cost",
              "remodel_rent": "remodel_cost", "remodel_live": "remodel_cost"}


def baseline_for(option: str) -> str:
    """매각형 대안은 현상태 매각, 보유형 대안은 현상태 유지와 비교한다."""
    return "keep" if option in ("remodel_rent", "remodel_live") else "sell_as_is"


def solve_root(f, lo: float, hi: float, tolerance: float = 1_000) -> float | None:
    """f(lo), f(hi) 부호가 다를 때 이분법으로 f(x)=0 의 해를 찾는다. 해가 없으면 None."""
    flo, fhi = f(lo), f(hi)
    if flo != flo or fhi != fhi:  # NaN
        return None
    if flo == 0:
        return lo
    if fhi == 0:
        return hi
    if (flo > 0) == (fhi > 0):
        return None
    a, b = lo, hi
    for _ in range(200):
        if b - a <= tolerance:
            break
        m = (a + b) / 2
        fm = f(m)
        if fm == 0:
            return m
        if (fm > 0) == (flo > 0):
            a, flo = m, fm
        else:
            b = m
    return (a + b) / 2


def _diff(option: str, field_name: str, p: Params, base_value: float):
    def f(x: float) -> float:
        r = simulate(option, replace(p, **{field_name: x}))
        return r["comparisonValue"] - base_value if r["computable"] else float("nan")
    return f


def breakeven_price(option: str, p: Params) -> dict:
    """대안의 비교가치가 기준안과 같아지는 매각가(또는 보유가치)."""
    field_name = PRICE_FIELD.get(option)
    if not field_name:
        return {"ok": False, "reason": "해당 없음"}
    base = simulate(baseline_for(option), p)
    if not base["computable"]:
        name = "현상태 유지" if baseline_for(option) == "keep" else "현상태 매각"
        return {"ok": False, "reason": f"기준안({name}) 계산 불가"}
    ref = max(p.as_is_price or 0, getattr(p, field_name) or 0, 100_000_000)
    f = _diff(option, field_name, p, base["comparisonValue"])
    if f(ref) != f(ref):
        r = simulate(option, replace(p, **{field_name: ref}))
        return {"ok": False, "reason": ", ".join(r["missing"]) or "대안 계산 불가"}
    v = solve_root(f, 0, ref * 10)
    if v is None:
        return {"ok": False, "reason": "탐색 범위(0 ~ 현재 추정가의 10배) 안에 손익분기 가격이 없음"}
    return {"ok": True, "value": v}


def max_allowable_cost(option: str, p: Params) -> dict:
    """대안의 비교가치가 기준안과 같아지는 실행비용 상한."""
    field_name = COST_FIELD.get(option)
    if not field_name:
        return {"ok": False, "reason": "해당 없음"}
    base = simulate(baseline_for(option), p)
    if not base["computable"]:
        return {"ok": False, "reason": "기준안 계산 불가"}
    f = _diff(option, field_name, p, base["comparisonValue"])
    at_zero = f(0)
    if at_zero != at_zero:
        r = simulate(option, replace(p, **{field_name: 0}))
        return {"ok": False, "reason": ", ".join(r["missing"]) or "대안 계산 불가"}
    if at_zero < 0:
        return {"ok": False, "reason": "실행비용이 0원이어도 기준안보다 불리함"}
    ref = max(p.as_is_price or 0, p.land_price or 0, p.remodel_price or 0, 100_000_000)
    v = solve_root(f, 0, ref * 5)
    return {"ok": True, "value": v} if v is not None else {"ok": False, "reason": "탐색 범위 안에 해가 없음"}


def rental_payback(p: Params) -> dict:
    """추가 실행비용 ÷ 현상태 대비 추가 '순'임대수입(개월). 추가 순수입이 0 이하면 회수 불가."""
    if p.remodel_cost is None:
        return {"ok": False, "reason": "리모델링 비용 미산정"}
    if p.remodel_rent is None:
        return {"ok": False, "reason": "리모델링 후 예상 월 임대료 미입력"}
    if p.occupancy == "tenant":
        if p.tenant_rent is None:
            return {"ok": False, "reason": "현재 월 임대료 미확인"}
        current = p.tenant_rent - p.maintenance_as_is
    else:
        current = -p.maintenance_as_is
    after = p.remodel_rent * (1 - p.remodel_vacancy) - p.remodel_maintenance
    extra = after - current
    if extra <= 0:
        return {"ok": False, "reason": "추가 순임대수입이 0 이하라 회수 불가", "extraMonthly": extra}
    return {"ok": True, "value": p.remodel_cost / extra, "extraMonthly": extra}
