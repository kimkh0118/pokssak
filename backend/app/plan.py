"""맞춤형 철거 플랜. 업체 연결 전에 확인할 순서. 최종 선택과 실행은 사용자가 결정한다."""

from __future__ import annotations


def build(analysis: dict) -> list[dict]:
    elig, result, answers = analysis["eligibility"], analysis["result"], analysis["answers"]
    inputs = analysis["inputs"]

    def st(done: bool, blocked: bool = False) -> str:
        return "done" if done else ("blocked" if blocked else "todo")

    owner_ok = answers.get("ownership") == "single" and not answers.get("corporate") and not answers.get("ownerMismatch")
    usage_ok = answers.get("usage") == "vacant" or (answers.get("usage") == "storage" and (answers.get("storageFollowup") or {}).get("inUse") == "no")
    prices = all((inputs.get(k) or {}).get("kind") == "consult" for k in ("H", "L"))
    quote = bool(((inputs.get("D") or {}).get("quote") or {}).get("value") or ((inputs.get("D") or {}).get("quote") or {}).get("min"))
    funding = (inputs.get("funding") or {}).get("prefund") == "yes"
    return [
        {"no": 1, "title": "소유·점유·건물·필지 범위 확인", "status": st(owner_ok and usage_ok and elig["amountRecommendationAllowed"]),
         "detail": "등기부등본으로 건물·토지 소유자, 점유 여부, 분석할 건물·필지 범위를 확인합니다.", "contact": "법무사·관할 구청 민원실"},
        {"no": 2, "title": "공인중개사에게 두 가지 매각 가격 확인", "status": st(prices),
         "detail": "같은 시점에 '현 상태 일괄 매각'과 '철거 후 토지 매각' 가격을 따로 물어보고, 현장 상태·진입 조건을 전달하세요.",
         "contact": "인근 공인중개사"},
        {"no": 3, "title": "빈집 철거 지원 신청 가능 여부 확인(빈집애·구청)",
         "status": st(bool(inputs.get("supports"))),
         "detail": "빈집애(www.binzibe.kr)에서 철거 지원을 신청하거나 구청 빈집 담당 부서에 올해 지원 여부를 물어보세요. "
                   "사전 승인이 필요한지, 철거 후 공공활용 의무로 바로 팔 수 없는지 꼭 확인하세요.",
         "contact": "빈집애 · 관할 구청 빈집 담당 부서"},
        {"no": 4, "title": "현장 접근·작업 범위·총 견적·행정절차 상담", "status": st(quote),
         "detail": "철거·폐기물·장비·석면·부대 업무·부가세·정리비 포함 여부를 확인하고 해체 신고·허가 절차를 묻습니다.",
         "contact": "철거업체(공개 연락처만, 제휴 아님)"},
        {"no": 5, "title": "확인된 지원과 자기부담·선지출 계획 비교", "status": st(funding),
         "detail": "사후 지급 지원금은 철거 전에 쓸 수 없습니다. 선지출 가능 금액을 입력하세요."},
        {"no": 6, "title": "신청 안내·업체 상담으로 이동", "status": "todo",
         "detail": "어떤 경로로 진행할지는 사용자가 선택합니다. 상담 링크를 눌러도 주소·응답·금액은 자동으로 전송되지 않습니다."},
    ]
