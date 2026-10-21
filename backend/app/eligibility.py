"""네 질문 답변 + 공공자료 점검 → 분석 경로.

자동 금액 추천 대상(모두 충족): 부산 단독·다가구 / 동일 개인이 건물·매각 대상 토지 모두 단독소유 /
주택 전체 미사용 / 건물·필지 범위 명확 / 건축물대장·토지정보 중대한 불일치 없음.
보류여도 공개 기본정보·제한 사유·추가 확인사항·상담 경로는 제공한다. 상속 취득은 제외 사유가 아니다.
사용자 응답은 공적 인증이 아니다.
"""

from __future__ import annotations

OWNERSHIP = {"single": "동일 개인의 단독소유", "joint": "공동소유", "other": "기타·잘 모르겠음"}
USAGE = {"vacant": "전체 미사용", "storage": "짐·가구 보관 중", "occupied": "임차인·점유자 거주 중", "unknown": "모름"}
DIRECTION = {"recovery": "회수금액 우선", "fast": "빠른 매각 우선", "undecided": "아직 모르겠음"}
CONDITION = {"usable": "양호·수리 가능", "old": "노후·대공사 필요", "severe": "심각한 노후·폐가", "unknown": "모름"}
ACCESS = {"good": "차량 진입 원활", "narrow": "진입은 가능하나 좁음", "none": "차량 진입 불가", "unknown": "모름"}


def evaluate(answers: dict, checks: list[dict], scope: dict) -> dict:
    """answers: ownership, corporate, ownerMismatch, usage, storageFollowup, direction, condition, access
    scope: 사용자가 확인한 분석 범위 {buildingKey, costsSeparable}"""
    hold, confirm, contacts = [], [], []

    for c in checks:
        if c["status"] == "fail":
            hold.append(f"{c['label']}: {c['detail']}")
        elif c["status"] == "unknown" and c["key"] != "scope":
            hold.append(f"{c['label']} 확인 필요: {c['detail']}")
    scope_check = next((c for c in checks if c["key"] == "scope"), None)
    if scope_check and scope_check["status"] != "pass":
        if not scope.get("buildingKey") or not scope.get("costsSeparable"):
            hold.append("분석할 건물·필지 범위와 비용을 구분할 수 없음(대상 건물 선택과 비용 구분 확인 필요)")

    own = answers.get("ownership")
    if own != "single":
        hold.append(f"소유 형태: {OWNERSHIP.get(own, '미응답')} — 공동·기타 소유는 자동 금액 추천을 보류합니다.")
        contacts.append("법무사·변호사 상담(공유자 동의·지분 정리)")
    if answers.get("corporate"):
        hold.append("법인 명의 — 자동 금액 추천 대상이 아닙니다.")
    if answers.get("ownerMismatch"):
        hold.append("건물과 토지 소유자가 다름 — 자동 금액 추천을 보류합니다.")
    confirm.append("등기부등본으로 건물·토지 소유자와 권리관계 확인(응답은 공적 인증이 아님)")

    usage = answers.get("usage")
    if usage == "occupied":
        hold.append("임차인·점유자 거주 중 — 명도·계약 관계 확인 전 자동 금액 추천을 보류합니다.")
        contacts.append("임대차 관계 정리 상담")
    elif usage == "unknown":
        hold.append("사용 상태 미확인")
    elif usage == "storage":
        f = answers.get("storageFollowup") or {}
        if f.get("inUse") != "no":
            hold.append("짐·가구 보관 중 — 실제 사용 여부 확인 필요(자동으로 미사용으로 보지 않음)")
        if f.get("cleanupKnown") != "yes":
            confirm.append("짐 정리 범위와 비용(정리비 항목에 입력)")

    cond = answers.get("condition")
    if cond in ("old", "severe"):
        confirm.append("구조 안전 상태 현장 확인(응답은 안전진단 결과가 아님)")
    if cond == "severe":
        confirm.append("붕괴 위험 시 관할 구청 안전 점검 문의")
    if cond == "unknown":
        confirm.append("건물 상태 현장 확인")

    acc = answers.get("access")
    if acc == "narrow":
        confirm.append("좁은 진입로 — 장비 규모·소운반 여부를 견적에 반영했는지 확인")
    elif acc == "none":
        confirm.append("차량 진입 불가 — 현장 작업 가능성과 대안(소형 장비·인력 철거) 상담 필요")
    elif acc == "unknown":
        confirm.append("공사차량 진입 가능 여부 현장 확인")

    return {
        "amountRecommendationAllowed": not hold,
        "holdReasons": hold,
        "confirmations": confirm,
        "contacts": contacts,
        "labels": {"ownership": OWNERSHIP.get(own), "usage": USAGE.get(usage), "direction": DIRECTION.get(answers.get("direction")),
                   "condition": CONDITION.get(cond), "access": ACCESS.get(acc)},
        "notice": "소유·공실 응답은 사용자 입력이며 공적 인증이 아닙니다.",
    }
