"""경제성 계산·민감도·조건부 추천 (규칙 기반). 같은 입력·같은 규칙 버전이면 같은 결과.

변수(원)
  H: 현 상태 건물·토지 일괄 판매가격      L: 철거 완료 후 같은 대상 토지 판매가격
  D: 철거 총비용                           M_H, M_L: 각 방식 중개보수
  C_H, C_L: 세금·보유관리비·금융비·정리비 등 기타 처리비용   G: 확인된 지원액(매각과 양립)
계산식
  N_H = H − M_H − C_H                      N_L = L − D − M_L − C_L + G
  Δ = N_L − N_H                            K = L − H − (M_L − M_H)   (추가비용 기준)
  D* = K − (C_L − C_H) + G  (철거비 손익분기점)   검증: Δ = D* − D
금액은 '처리 비용을 차감한 예상 회수액'이며 취득비용을 반영한 순이익이나 대출 정산 후 실수령액이 아니다.
반올림은 표시 단계에서만 한다.
"""

from __future__ import annotations

from itertools import product

RULE_VERSION = "busan-vacant-2026.10.1"
BROKERAGE_RULE = {
    "name": "공인중개사법 시행규칙 별표1 중개보수 상한요율",
    "effective": "2021-10-19",
    "version": "2021.10",
    "note": "상한요율 기준 계산값. 실제 보수는 협의로 정하며 부가세 별도. 실제 협의액을 입력하면 그 값을 씁니다.",
}
_HOUSING = [(50_000_000, 0.006, 250_000), (200_000_000, 0.005, 800_000), (900_000_000, 0.004, None),
            (1_200_000_000, 0.005, None), (1_500_000_000, 0.006, None), (float("inf"), 0.007, None)]
SENSITIVITY = 0.10  # 개발 점검 가정(실제 가격 오차 확률 아님)
COST_PARTS = ("tax", "holding", "finance", "cleanup", "other")
COST_PART_LABEL = {"tax": "세금", "holding": "보유·관리비", "finance": "금융비", "cleanup": "정리비", "other": "기타"}
QUOTE_ITEMS = {"demolition": "철거 공사", "waste": "폐기물 처리", "equipment": "장비·운반", "asbestos": "석면 관련",
               "admin": "부대 업무(멸실신고 등)", "vat": "부가세", "cleanup": "별도 정리 비용"}


def brokerage_cap(price: float, land: bool) -> float:
    """주택: 구간별 상한요율·한도 / 토지(주택 외): 0.9%."""
    if price <= 0:
        return 0.0
    if land:
        return price * 0.009
    for below, rate, cap in _HOUSING:
        if price < below:
            fee = price * rate
            return min(fee, cap) if cap is not None else fee
    return 0.0


# ---------------------------------------------------------------- 입력 근거
def ev_range(e: dict | None) -> tuple[float, float] | None:
    """근거 → (최소, 최대). 미확인이면 None. '적용 없음'은 (0, 0)."""
    if not e or e.get("kind") in (None, "unknown"):
        return None
    if e.get("kind") == "none":
        return (0.0, 0.0)
    if e.get("min") is not None and e.get("max") is not None:
        return (float(e["min"]), float(e["max"]))
    if e.get("value") is not None:
        return (float(e["value"]), float(e["value"]))
    return None


def mid(r: tuple[float, float]) -> float:
    return (r[0] + r[1]) / 2


def cost_total(parts: dict | None) -> dict:
    """기타 처리비용 C = 세금+보유관리비+금융비+정리비+기타. 미확인 항목이 있으면 missing 에 담는다."""
    parts = parts or {}
    lo = hi = 0.0
    missing = []
    for p in COST_PARTS:
        r = ev_range(parts.get(p))
        if r is None:
            missing.append(COST_PART_LABEL[p])
        else:
            lo, hi = lo + r[0], hi + r[1]
    return {"range": (lo, hi), "missing": missing}


def price_evidence_ok(e: dict | None, kind: str) -> list[str]:
    """조건부 추천에 쓸 수 있는 가격인지. kind: as_is(H) | land(L). 문제 목록을 돌려준다."""
    name = "현 상태 일괄 매각가격" if kind == "as_is" else "철거 후 토지 매각가격"
    if not e or e.get("kind") in (None, "unknown"):
        return [f"{name} 미확인"]
    if e.get("kind") != "consult":
        return [f"{name}이(가) 상담 근거가 아님({ {'public': '공공자료 참고값', 'assumption': '사용자 가정'}.get(e.get('kind'), e.get('kind'))})"]
    problems = []
    if e.get("priceType") != kind:
        problems.append(f"{name}: 가격 종류(현 상태 일괄 / 철거 후 토지)가 구분되지 않음")
    if e.get("wishPrice"):
        problems.append(f"{name}: 단순 희망가격")
    if not e.get("scopeMatches"):
        problems.append(f"{name}: 대상 주소·범위 일치 미확인")
    if not e.get("source") or not e.get("checkedOn"):
        problems.append(f"{name}: 상담 경로·확인일 기록 없음")
    if not e.get("siteConditionShared"):
        problems.append(f"{name}: 현장 상태·접근 조건 전달 미확인")
    return problems


def demolition_cost(d: dict | None, floor_area_sqm: float | None, access: str) -> dict:
    """D. 실제 견적 우선. 가정 시뮬레이션(연면적×평당 단가×할증)은 추천 근거로 쓰지 않는다.
    견적에 할증이 이미 포함됐으면 다시 곱하지 않는다."""
    d = d or {}
    quote = d.get("quote")
    if quote and ev_range(quote):
        r = ev_range(quote)
        items = quote.get("items") or {}
        unknown_items = [QUOTE_ITEMS[k] for k in QUOTE_ITEMS if items.get(k) not in ("included", "excluded_na")]
        problems = []
        if unknown_items:
            problems.append("견적 포함 여부 미확인: " + ", ".join(unknown_items))
        if access == "none" and not quote.get("siteWorkConfirmed"):
            problems.append("차량 진입 불가 — 현장 작업 가능성·대안 확인 필요")
        if not quote.get("source") or not quote.get("checkedOn"):
            problems.append("견적 출처·확인일 기록 없음")
        return {"range": r, "basis": "quote", "problems": problems, "surchargeApplied": False,
                "note": "실제 견적. 견적에 포함된 장비·인력 할증은 다시 곱하지 않음"}
    sim = d.get("simulation")
    if sim and sim.get("unitPerPyeong") and floor_area_sqm:
        pyeong = floor_area_sqm / (400 / 121)
        base = pyeong * float(sim["unitPerPyeong"])
        mult = float(sim.get("multiplier") or 1.0)
        share = float(sim.get("multiplierShare") or 1.0)  # 할증이 적용되는 공종 비중(1.0 = 전체)
        total = base * (1 - share) + base * share * mult
        return {"range": (total, total), "basis": "assumption",
                "problems": ["사용자 가정 시뮬레이션(검증된 단가·할증 근거 아님)"], "surchargeApplied": mult != 1.0,
                "note": f"연면적 {pyeong:.1f}평 × 평당 {sim['unitPerPyeong']:,.0f}원" + (f", 공종 {share:.0%}에 할증 ×{mult}" if mult != 1 else "")}
    return {"range": None, "basis": None, "problems": ["철거비 미확인(견적 필요)"], "surchargeApplied": False, "note": None}


# ---------------------------------------------------------------- 계산
def scenario(H, L, D, CH, CL, G, MH_fixed=None, ML_fixed=None) -> dict:
    """단일 값 계산. M 은 고정값이 없으면 가격에서 규칙으로 다시 계산."""
    MH = MH_fixed if MH_fixed is not None else brokerage_cap(H, land=False)
    ML = ML_fixed if ML_fixed is not None else brokerage_cap(L, land=True)
    NH = H - MH - CH
    NL = L - D - ML - CL + G
    K = L - H - (ML - MH)
    Dstar = K - (CL - CH) + G
    return {"H": H, "L": L, "D": D, "M_H": MH, "M_L": ML, "C_H": CH, "C_L": CL, "G": G,
            "N_H": NH, "N_L": NL, "delta": NL - NH, "K": K, "D_star": Dstar}


def winner(delta: float) -> str:
    return "tie" if delta == 0 else ("demolish" if delta > 0 else "sell_as_is")


def compare(Hr, Lr, Dr, CHr, CLr, G, MH_fixed=None, ML_fixed=None, H_base=None, L_base=None) -> dict:
    """범위 입력 → 기준 결과, 회수액 범위, 8개 민감도 조합.
    기준값: 입력이 범위면 가운데 값, 공공 참고가격이면 중앙값(H_base/L_base)."""
    base = scenario(H_base if H_base is not None else mid(Hr), L_base if L_base is not None else mid(Lr),
                    mid(Dr), mid(CHr), mid(CLr), G, MH_fixed, ML_fixed)
    # 회수액 범위: N_H 는 가격 낮고 비용 높을 때 최소
    nh_lo = scenario(Hr[0], Lr[0], Dr[1], CHr[1], CLr[1], G, MH_fixed, ML_fixed)["N_H"]
    nh_hi = scenario(Hr[1], Lr[1], Dr[0], CHr[0], CLr[0], G, MH_fixed, ML_fixed)["N_H"]
    nl_lo = scenario(Hr[0], Lr[0], Dr[1], CHr[1], CLr[1], G, MH_fixed, ML_fixed)["N_L"]
    nl_hi = scenario(Hr[1], Lr[1], Dr[0], CHr[0], CLr[0], G, MH_fixed, ML_fixed)["N_L"]
    overlap = not (nl_lo > nh_hi or nh_lo > nl_hi)

    checks = []
    for fh, fl, fd in product((1 - SENSITIVITY, 1 + SENSITIVITY), repeat=3):
        # 범위 입력이면 배율을 원래 범위 양 끝에 적용하고, 그 안에서 불리한·유리한 끝을 모두 본다
        h = (Hr[0] * fh, Hr[1] * fh)
        l = (Lr[0] * fl, Lr[1] * fl)
        d = (Dr[0] * fd, Dr[1] * fd)
        ends = [scenario(hh, ll, dd, mid(CHr), mid(CLr), G, MH_fixed, ML_fixed)["delta"]
                for hh in h for ll in l for dd in d]
        w = {winner(x) for x in ends}
        checks.append({"H": fh, "L": fl, "D": fd, "deltaMin": min(ends), "deltaMax": max(ends),
                       "winner": w.pop() if len(w) == 1 else "mixed"})
    winners = {c["winner"] for c in checks}
    return {"base": base, "ranges": {"N_H": (nh_lo, nh_hi), "N_L": (nl_lo, nl_hi)}, "overlap": overlap,
            "sensitivity": checks, "consistentWinner": winners.pop() if len(winners) == 1 else None}


# ---------------------------------------------------------------- 추천
def evaluate(inputs: dict, context: dict) -> dict:
    """inputs: H, L, D{quote|simulation}, M_H, M_L(실제 협의액, 선택), C_H, C_L(항목별), period_H, period_L,
               funding{prefund: yes|no|unknown, available}, supports[...]
    context: eligibility(분석 경로), reference(공공 참고가격), floorArea, access
    결과 상태: conditional(조건부 추천) | uncertain(우열 불확실) | hold(추천 보류)"""
    reasons, missing = [], []
    elig = context["eligibility"]
    if not elig["amountRecommendationAllowed"]:
        missing += elig["holdReasons"]

    # 가격: 상담 근거
    H_ev, L_ev = inputs.get("H"), inputs.get("L")
    missing += price_evidence_ok(H_ev, "as_is") + price_evidence_ok(L_ev, "land")
    if H_ev and L_ev and H_ev.get("kind") == L_ev.get("kind") == "consult":
        if H_ev.get("checkedOn") and L_ev.get("checkedOn") and abs(_days(H_ev["checkedOn"], L_ev["checkedOn"])) > 92:
            missing.append("두 상담 가격의 확인 시점 차이가 3개월을 넘어 비교 기준이 다름")

    D = demolition_cost(inputs.get("D"), context.get("floorArea"), context.get("access"))
    if D["basis"] != "quote":
        missing += D["problems"]
    else:
        missing += D["problems"]

    CH, CL = cost_total(inputs.get("C_H")), cost_total(inputs.get("C_L"))
    if CH["missing"]:
        missing.append("현 상태 판매 기타비용 미확인: " + ", ".join(CH["missing"]))
    if CL["missing"]:
        missing.append("철거 후 판매 기타비용 미확인: " + ", ".join(CL["missing"]))
    for k, label in (("period_H", "현 상태 판매"), ("period_L", "철거 후 판매")):
        if ev_range(inputs.get(k)) is None:
            missing.append(f"{label} 예상 처리 기간 미확인")

    MH_fixed = mid(ev_range(inputs["M_H"])) if ev_range(inputs.get("M_H")) else None
    ML_fixed = mid(ev_range(inputs["M_L"])) if ev_range(inputs.get("M_L")) else None
    G_info = support_amount(inputs.get("supports") or [])

    # 계산에 쓸 값: 상담·가정값이 있으면 그것, 없으면 공공 참고가격(참고 비교용)
    ref = context.get("reference") or {}
    Hr = ev_range(H_ev) or _ref_range(ref.get("house"))
    Lr = ev_range(L_ev) or _ref_range(ref.get("land"))
    H_base = None if ev_range(H_ev) else (ref.get("house") or {}).get("value")  # 참고가격은 중앙값을 기준으로
    L_base = None if ev_range(L_ev) else (ref.get("land") or {}).get("value")
    Dr = D["range"]
    calc = None
    if Hr and Lr:
        calc_D = Dr or (0.0, 0.0)
        calc = {
            "withoutSupport": compare(Hr, Lr, calc_D, CH["range"], CL["range"], 0.0, MH_fixed, ML_fixed, H_base, L_base),
            "withSupport": compare(Hr, Lr, calc_D, CH["range"], CL["range"], G_info["G"], MH_fixed, ML_fixed, H_base, L_base)
            if G_info["G"] else None,
            "demolitionKnown": Dr is not None,
            "costsComplete": not CH["missing"] and not CL["missing"],
            "priceBasis": {"H": (H_ev or {}).get("kind") or ("public" if ref.get("house") else None),
                           "L": (L_ev or {}).get("kind") or ("public" if ref.get("land") else None)},
        }

    status, leader, execution = "hold", None, None
    if calc and calc["demolitionKnown"]:
        cw = calc["withoutSupport"]
        leader = winner(cw["base"]["delta"])
    if not missing and calc:
        cw = calc["withoutSupport"]
        if cw["overlap"] or cw["consistentWinner"] in (None, "tie", "mixed") or cw["base"]["delta"] == 0:
            status = "uncertain"
            reasons.append("회수액 범위가 겹치거나 ±10% 점검에서 우열이 바뀝니다.")
        else:
            status, execution = "conditional", cw["consistentWinner"]
    # 철거 후 판매 실행 추천은 선지출 가능 여부를 따로 확인(현 상태 판매에는 요구하지 않음)
    funding = inputs.get("funding") or {}
    if execution == "demolish":
        need = Dr[1] - G_info["prepaid"] if Dr else None
        if funding.get("prefund") != "yes" or funding.get("available") is None or (need is not None and funding["available"] < need):
            status, execution = "hold", None
            missing.append("철거 선지출 자금 마련 가능 여부 미확인 또는 부족(사후 지급 지원금은 선지출 자금으로 보지 않음)")
    if status == "hold" and not missing:
        missing.append("비교에 필요한 가격 자료가 없습니다.")

    return {
        "ruleVersion": RULE_VERSION, "status": status, "computedLeader": leader, "executionRecommendation": execution,
        "reasons": reasons, "missing": missing, "calc": calc, "demolition": D, "costs": {"C_H": CH, "C_L": CL},
        "support": G_info, "brokerageRule": BROKERAGE_RULE, "sensitivityAssumption": SENSITIVITY,
        "label": "처리 비용을 차감한 예상 회수액(취득비용·대출 정산 미반영)",
    }


def _ref_range(ref: dict | None) -> tuple[float, float] | None:
    if not ref or ref.get("value") is None:
        return None
    r = ref.get("range")
    return (r["min"], r["max"]) if r else (ref["value"], ref["value"])


def _days(a: str, b: str) -> int:
    from datetime import date
    return (date.fromisoformat(a) - date.fromisoformat(b)).days


def support_amount(supports: list[dict]) -> dict:
    """확인된 지원만 반영. 현금 보조만 G 로 더한다. 직접 수행은 철거비를 줄이는 것이라 G 에 더하지 않는다.
    매각과 양립하지 않거나 중복수혜 미확인이면 제외. 사후 지급은 선지출 자금으로 보지 않는다."""
    G = prepaid = 0.0
    used, excluded = [], []
    for s in supports:
        name = s.get("name") or "지원사업"
        if not s.get("confirmed"):
            excluded.append(f"{name}: 확정 지원액 미확인(공고 최대액은 반영하지 않음)")
        elif s.get("saleCompatible") is not True:
            excluded.append(f"{name}: 즉시 매각과 양립 여부 미확인 또는 불가(공공활용 의무 등)")
        elif s.get("type") == "direct":
            excluded.append(f"{name}: 지자체 직접 수행 — 철거 견적에서 해당 부분을 빼고 입력하세요(지원금으로 중복 가산 안 함)")
        elif s.get("type") == "tax":
            excluded.append(f"{name}: 세제 혜택 — 세금 항목에 반영하세요")
        elif len([x for x in supports if x.get("confirmed")]) > 1 and not s.get("noDuplicationConfirmed"):
            excluded.append(f"{name}: 중복수혜·상충 여부 미확인으로 합산하지 않음")
        else:
            amt = float(s.get("confirmedAmount") or 0)
            G += amt
            if s.get("payment") == "pre":
                prepaid += amt
            used.append({"name": name, "amount": amt, "payment": s.get("payment")})
    return {"G": G, "prepaid": prepaid, "used": used, "excluded": excluded}


# ---------------------------------------------------------------- 보유·리모델링 안내
def holding_guide(inputs: dict) -> dict:
    """보유 기간별 입력 비용 합계. 보유 자산 가격은 현금 수익에 더하지 않는다."""
    yearly = {k: ev_range((inputs.get("holding") or {}).get(k)) for k in ("tax", "management", "insurance", "other")}
    labels = {"tax": "재산세 등 보유세", "management": "관리·수선비", "insurance": "보험료", "other": "기타"}
    known = {k: v for k, v in yearly.items() if v}
    per_year = (sum(v[0] for v in known.values()), sum(v[1] for v in known.values()))
    return {
        "perYear": per_year if known else None,
        "totals": {y: (per_year[0] * y, per_year[1] * y) for y in (1, 3, 5)} if known else None,
        "unreflected": [labels[k] for k, v in yearly.items() if not v],
        "plan": (inputs.get("holding") or {}).get("plan"),
        "note": "보유하는 집의 가격은 현금 수익에 더하지 않습니다. 활용 계획·수리 범위·견적·공사 기간은 현장 확인이 필요합니다.",
    }


def remodel_option(inputs: dict) -> dict:
    """리모델링 후 매각(확장 옵션). 수리 후 상담 가격·공사 견적·거래·세금·보유 비용이 모두 있어야 계산."""
    r = inputs.get("remodel") or {}
    R, Q = ev_range(r.get("priceAfter")), ev_range(r.get("quote"))
    C = cost_total(r.get("costs"))
    need = []
    if not R or (r.get("priceAfter") or {}).get("kind") != "consult":
        need.append("대상에 대한 수리 후 상담 가격")
    if not Q:
        need.append("리모델링 공사 견적")
    if C["missing"]:
        need.append("거래·세금·보유 비용: " + ", ".join(C["missing"]))
    if need:
        return {"enabled": False, "need": need, "note": "공사비만큼 집값이 오른다고 가정하지 않습니다."}
    M = brokerage_cap(mid(R), land=False)
    return {"enabled": True, "N_R": mid(R) - mid(Q) - M - mid(C["range"]), "M_R": M,
            "range": (R[0] - Q[1] - brokerage_cap(R[0], False) - C["range"][1], R[1] - Q[0] - brokerage_cap(R[1], False) - C["range"][0])}
