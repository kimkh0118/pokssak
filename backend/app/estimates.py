"""가격·비용 추정.

- 현상태 매각가: 주변 단독·다가구 실거래 사례로만 추정(공시지가는 쓰지 않음).
- 철거 후 토지 매각가: 토지 거래 사례로만 추정(주택 가격에 상승률을 곱하지 않음).
- 표본이 부족하면 숫자를 만들지 않고 보류한다.
- 철거·리모델링 단가는 화면 흐름을 위한 '가정값'이다. 공식 단가가 아니며 견적으로 바꿔야 한다.
"""

from __future__ import annotations

MIN_COMPS = 3
AREA_RATIO = (0.5, 2.0)
BUILD_YEAR_GAP = 15

COST_SOURCE = "서비스 기본 가정값(공식 단가 아님 · 견적으로 대체 필요)"
COST_AS_OF = "2026-10 작성"
COST_REGION = "전국 공통(지역 차이 미반영)"

# 원/㎡(연면적 기준) 또는 정액, {낮음, 기준, 높음}
UNIT_COSTS = {
    "demolition_per_sqm": {"low": 40_000, "base": 60_000, "high": 85_000},
    "demolition_waste_per_sqm": {"low": 20_000, "base": 30_000, "high": 45_000},
    "demolition_soft_cost": {"low": 3_000_000, "base": 5_000_000, "high": 8_000_000},
    "remodel_partial_per_sqm": {"low": 300_000, "base": 450_000, "high": 650_000},
    "remodel_full_per_sqm": {"low": 600_000, "base": 900_000, "high": 1_300_000},
    "remodel_waste_per_sqm": {"low": 20_000, "base": 30_000, "high": 40_000},
    "remodel_soft_rate": {"low": 0.05, "base": 0.07, "high": 0.10},
}
CONTINGENCY_RATE = 0.10

# 집 상태 답변에 따른 현 건물 월 유지관리비 가정(전문 진단 아님)
MAINTENANCE_BY_CONDITION = {"good": 50_000, "partial_repair": 150_000, "major_repair": 300_000, "unknown": 150_000}


# ---------------------------------------------------------------- 비교 사례
def quantile(values: list[float], q: float) -> float:
    pos = (len(values) - 1) * q
    lo, hi = int(pos), min(int(pos) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (pos - lo)


def _withheld(reason: str, criteria: list[str], decisions=None, size=0) -> dict:
    return {"range": None, "basis": None, "sampleSize": size, "pricePerLandSqm": None,
            "decisions": decisions or [], "criteria": criteria, "withheldReason": reason}


def estimate_from_trades(subject: dict, trades: list[dict], use_building_filters: bool = True) -> dict:
    """대지면적당 거래가의 25·50·75% 분위수 × 대상 대지면적.
    subject: {landArea, floorArea, buildYear, umdNm}
    """
    lo_r, hi_r = AREA_RATIO
    criteria = [
        "같은 시군구 매매 신고 자료(최근 12개월)",
        "해제(취소)된 거래 제외",
        "직거래 제외(시장 가격과 다를 가능성)",
        f"대지면적이 대상의 {lo_r}~{hi_r}배 범위",
    ]
    if use_building_filters:
        criteria += [f"연면적이 대상의 {lo_r}~{hi_r}배 범위(양쪽 정보가 있을 때)",
                     f"건축년도 차이 {BUILD_YEAR_GAP}년 이내(양쪽 정보가 있을 때)"]
    criteria += [f"같은 법정동 사례가 {MIN_COMPS}건 이상이면 같은 동만 사용, 아니면 시군구 전체",
                 "대지면적당 가격의 25%·50%·75% 분위수 × 대상 대지면적"]

    land_area = subject.get("landArea")
    if not land_area:
        return _withheld("대상 토지 면적 정보가 없어 비교할 수 없습니다.", criteria)

    def judge(t: dict) -> tuple[bool, str]:
        if t["cancelled"]:
            return False, "해제된 거래"
        if t.get("dealingGbn") and "직거래" in t["dealingGbn"]:
            return False, "직거래"
        if not t.get("amountWon"):
            return False, "거래금액 없음"
        if not t.get("landArea"):
            return False, "대지면적 없음"
        ratio = t["landArea"] / land_area
        if not lo_r <= ratio <= hi_r:
            return False, f"대지면적 차이 큼({ratio:.2f}배)"
        if use_building_filters:
            if subject.get("floorArea") and t.get("floorArea"):
                fr = t["floorArea"] / subject["floorArea"]
                if not lo_r <= fr <= hi_r:
                    return False, f"연면적 차이 큼({fr:.2f}배)"
            if subject.get("buildYear") and t.get("buildYear"):
                gap = abs(subject["buildYear"] - t["buildYear"])
                if gap > BUILD_YEAR_GAP:
                    return False, f"건축년도 차이 {gap}년"
        return True, "기준 충족"

    decisions = []
    for t in trades:
        included, reason = judge(t)
        per_sqm = t["amountWon"] / t["landArea"] if t.get("amountWon") and t.get("landArea") else None
        decisions.append({"trade": t, "included": included, "reason": reason, "pricePerLandSqm": per_sqm})

    pool = [d for d in decisions if d["included"]]
    basis = "district"
    same_dong = [d for d in pool if subject.get("umdNm") and d["trade"]["umdNm"] == subject["umdNm"]]
    if len(same_dong) >= MIN_COMPS:
        basis = "same_dong"
        keep = {id(d) for d in same_dong}
        for d in pool:
            if id(d) not in keep:
                d["included"], d["reason"] = False, "같은 동 사례가 충분해 제외"
        pool = same_dong

    if len(pool) < MIN_COMPS:
        return _withheld(f"기준을 충족하는 사례가 {len(pool)}건으로 {MIN_COMPS}건 미만이라 산정을 보류합니다.",
                         criteria, decisions, len(pool))

    per = sorted(d["pricePerLandSqm"] for d in pool)
    per_sqm = {"low": quantile(per, 0.25), "base": quantile(per, 0.5), "high": quantile(per, 0.75)}
    return {
        "range": {k: round(v * land_area) for k, v in per_sqm.items()},
        "basis": basis, "sampleSize": len(pool), "pricePerLandSqm": per_sqm,
        "decisions": decisions, "criteria": criteria, "withheldReason": None,
    }


def estimate_land_price(subject: dict, land_trades: list[dict] | None) -> dict:
    if land_trades is None:
        return _withheld("토지 거래 사례 자료가 연동되지 않았습니다. 전문가 의견이나 직접 확인한 토지 시세를 입력하면 계산합니다.",
                         ["같은 시군구 토지 매매 사례(지목 '대')", "해제된 거래·직거래 제외",
                          "㎡당 가격의 25%·50%·75% 분위수 × 대상 토지 면적"])
    plots = [t for t in land_trades if not t.get("landUse") or "대" in t["landUse"]]
    return estimate_from_trades(subject, plots, use_building_filters=False)


# ---------------------------------------------------------------- 철거·리모델링 비용
def _scale(r: dict, k: float) -> dict:
    return {key: round(v * k) for key, v in r.items()}


def _total(rs: list[dict]) -> dict:
    return {key: sum(r[key] for r in rs) for key in ("low", "base", "high")}


def _line(key, label, amount, basis, unit_cost=None, area=None) -> dict:
    return {"key": key, "label": label, "amount": amount, "basis": basis, "unitCost": unit_cost,
            "unit": "원/㎡" if unit_cost else None, "appliedArea": area,
            "source": COST_SOURCE, "asOf": COST_AS_OF, "region": COST_REGION}


def estimate_demolition(floor_area: float | None) -> dict:
    """철거 실행비용 = 해체 공사비 + 폐기물 처리비 + 부대비 + 예비비.
    공사 중 보유비·금융비용·이주비는 월별 현금흐름에서 따로 계산한다."""
    if not floor_area:
        return {"lines": [], "total": None, "withheldReason": "연면적 정보가 없어 철거비를 추정할 수 없습니다."}
    u = UNIT_COSTS
    work = _scale(u["demolition_per_sqm"], floor_area)
    waste = _scale(u["demolition_waste_per_sqm"], floor_area)
    soft = u["demolition_soft_cost"]
    reserve = _scale(_total([work, waste, soft]), CONTINGENCY_RATE)
    lines = [
        _line("demolition_work", "해체 공사비", work, f"연면적 {floor_area:.1f}㎡ × {u['demolition_per_sqm']['base']:,}원/㎡(기준)", u["demolition_per_sqm"], floor_area),
        _line("demolition_waste", "폐기물 처리비", waste, f"연면적 {floor_area:.1f}㎡ × {u['demolition_waste_per_sqm']['base']:,}원/㎡(기준)", u["demolition_waste_per_sqm"], floor_area),
        _line("demolition_soft", "부대비(해체계획서·감리·멸실신고 등)", soft, "정액 가정"),
        _line("demolition_reserve", "예비비", reserve, f"소계의 {CONTINGENCY_RATE:.0%}"),
    ]
    return {"lines": lines, "total": _total([work, waste, soft, reserve]), "withheldReason": None}


def estimate_remodel(floor_area: float | None, scope: str) -> dict:
    """리모델링 실행비용 = 공사비 + 폐기물 처리비 + 설계·인허가 부대비 + 예비비. scope: partial | full"""
    if not floor_area:
        return {"lines": [], "total": None, "withheldReason": "연면적 정보가 없어 리모델링 비용을 추정할 수 없습니다."}
    u = UNIT_COSTS
    unit = u["remodel_full_per_sqm"] if scope == "full" else u["remodel_partial_per_sqm"]
    work = _scale(unit, floor_area)
    waste = _scale(u["remodel_waste_per_sqm"], floor_area)
    soft = {k: round(work[k] * u["remodel_soft_rate"][k]) for k in work}
    reserve = _scale(_total([work, waste, soft]), CONTINGENCY_RATE)
    rate = u["remodel_soft_rate"]
    lines = [
        _line("remodel_work", f"공사비({'전면' if scope == 'full' else '부분'} 리모델링)", work, f"연면적 {floor_area:.1f}㎡ × {unit['base']:,}원/㎡(기준)", unit, floor_area),
        _line("remodel_waste", "폐기물 처리비", waste, f"연면적 {floor_area:.1f}㎡ × {u['remodel_waste_per_sqm']['base']:,}원/㎡(기준)", u["remodel_waste_per_sqm"], floor_area),
        _line("remodel_soft", "설계·인허가 등 부대비", soft, f"공사비의 {rate['low']:.0%}~{rate['high']:.0%}"),
        _line("remodel_reserve", "예비비", reserve, f"소계의 {CONTINGENCY_RATE:.0%}"),
    ]
    return {"lines": lines, "total": _total([work, waste, soft, reserve]), "withheldReason": None}
