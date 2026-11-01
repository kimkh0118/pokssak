"""예상 철거비(개략 범위). 업체 견적이 아니며, 견적을 받으면 그 값을 쓴다.

건축물대장(연면적·구조·층수·지하·건축면적·지붕·높이·사용승인일)과 질문 답(차량 진입·건물 상태·짐 보관)으로
항목별 최소~최대를 더한다. 단가는 공개 자료와 업계에서 흔히 쓰는 범위를 단순화한 개발 설정값(2026년 기준)이다.
"""

from __future__ import annotations

# 구조별 철거·운반 + 일반 폐기물 처리 단가(원/연면적㎡) 최소~최대
STRUCTURE_UNIT = (
    ("철근콘크리트", (90_000, 140_000)), ("철골철근", (95_000, 150_000)), ("철골", (70_000, 110_000)),
    ("경량철골", (55_000, 85_000)), ("벽돌", (65_000, 100_000)), ("조적", (65_000, 100_000)),
    ("블록", (60_000, 95_000)), ("목조", (50_000, 80_000)),
)
DEFAULT_UNIT = ("구조 미상", (65_000, 110_000))
MINIMUM = (3_500_000, 5_000_000)            # 아주 작은 집도 장비·인력 기본 비용
SLATE_PER_M2 = (35_000, 55_000)             # 슬레이트 해체·지정폐기물 처리(지붕 면적당)
ASBESTOS_SURVEY = (300_000, 800_000)        # 석면 조사(해체 전 의무 대상일 때)
ACCESS = {"good": (1.0, 1.0), "narrow": (1.10, 1.25), "none": (1.30, 1.60), "unknown": (1.0, 1.25)}
CLEANUP = (500_000, 2_000_000)              # 남은 짐·가구 정리(짐 보관 중일 때)
REPORT = (300_000, 1_000_000)               # 해체 신고(해체계획서 작성 대행 포함)
PERMIT = (2_000_000, 5_000_000)             # 해체 허가 대상: 계획서·안전점검 + 감리


def _unit(structure: str | None) -> tuple[str, tuple[int, int]]:
    for key, rng in STRUCTURE_UNIT:
        if structure and key in structure:
            return key, rng
    return DEFAULT_UNIT


def estimate(building: dict | None, answers: dict, today_year: int) -> dict | None:
    """반환: {min, max, mid, items:[{label, min, max, note}], notes:[...]} 또는 연면적을 모르면 None."""
    b = building or {}
    floor = b.get("totArea")
    if not floor:
        return None
    items, notes = [], []
    name, (lo, hi) = _unit(b.get("strctCdNm"))
    lo, hi = floor * lo, floor * hi
    adj = []
    if (b.get("grndFlrCnt") or 0) >= 3:
        lo, hi = lo * 1.08, hi * 1.15
        adj.append("3층 이상")
    if (b.get("ugrndFlrCnt") or 0) > 0:
        lo, hi = lo * 1.15, hi * 1.30
        adj.append("지하층 있음")
    if answers.get("condition") == "severe":
        lo, hi = lo * 1.05, hi * 1.15
        adj.append("붕괴 위험 안전 조치")
    lo, hi = max(lo, MINIMUM[0]), max(hi, MINIMUM[1])
    items.append({"label": "철거·운반·폐기물", "min": lo, "max": hi,
                  "note": f"{name} · 연면적 {floor:g}㎡" + (f" · {', '.join(adj)}" if adj else "")})

    # 석면: 슬레이트 지붕이면 확정 항목, 오래된 건물은 조사 필요(1990년대 이전 건물에 석면 자재가 흔함)
    year = int(b["useAprDay"][:4]) if b.get("useAprDay") and b["useAprDay"][:4].isdigit() else None
    roof = b.get("roofCdNm") or ""
    roof_area = b.get("archArea") or (floor / max(1, b.get("grndFlrCnt") or 1))
    if "슬레이트" in roof:
        items.append({"label": "슬레이트 지붕 해체·처리", "min": roof_area * SLATE_PER_M2[0], "max": roof_area * SLATE_PER_M2[1],
                      "note": f"지붕 약 {roof_area:.0f}㎡ · 지정폐기물. 슬레이트 처리 지원(구청 환경 부서)을 받으면 줄어요"})
        items.append({"label": "석면 조사", "min": ASBESTOS_SURVEY[0], "max": ASBESTOS_SURVEY[1], "note": "해체 전 석면 조사"})
    elif year and year < 1997:
        items.append({"label": "석면 조사·처리(있을 경우)", "min": ASBESTOS_SURVEY[0], "max": ASBESTOS_SURVEY[1] + roof_area * SLATE_PER_M2[1],
                      "note": f"{year}년 건물 — 석면 자재가 있으면 처리비가 더 들어요(조사 후 확정)"})

    # 행정: 연면적 500㎡ 미만·높이 12m 미만·지상 3층 이하면 보통 '신고', 아니면 '허가'(계획서·감리)
    small = floor < 500 and (b.get("heit") or 0) < 12 and (b.get("grndFlrCnt") or 1) <= 3 and not (b.get("ugrndFlrCnt") or 0)
    adm = REPORT if small else PERMIT
    items.append({"label": "해체 " + ("신고" if small else "허가·감리"), "min": adm[0], "max": adm[1],
                  "note": "구청 건축과에 해체 신고" if small else "규모가 커서 해체 허가·감리 대상일 수 있어요"})

    if answers.get("usage") == "storage":
        items.append({"label": "남은 짐·가구 정리", "min": CLEANUP[0], "max": CLEANUP[1], "note": "짐 보관 중이라고 답함"})

    total_lo = sum(i["min"] for i in items)
    total_hi = sum(i["max"] for i in items)
    acc = answers.get("access") or "unknown"
    a_lo, a_hi = ACCESS.get(acc, ACCESS["unknown"])
    if a_hi > 1.0:
        extra_lo, extra_hi = items[0]["min"] * (a_lo - 1), items[0]["max"] * (a_hi - 1)
        items.append({"label": "차량 진입 곤란 할증", "min": extra_lo, "max": extra_hi,
                      "note": {"narrow": "좁은 길 — 소형 장비·추가 운반", "none": "차량 진입 불가 — 사람이 나르는 소운반",
                               "unknown": "진입 여부 모름 — 확인 필요"}.get(acc, "")})
        total_lo, total_hi = total_lo + extra_lo, total_hi + extra_hi
    notes.append("개략 범위예요. 실제 금액은 현장을 본 업체 견적으로 정해져요. 2~3곳 견적을 비교하세요.")
    if not b.get("roofCdNm"):
        notes.append("지붕 정보가 없어 슬레이트 여부를 반영하지 못했어요.")
    return {"min": total_lo, "max": total_hi, "mid": (total_lo + total_hi) / 2, "items": items, "notes": notes}
