"""화면·메시지에 쓰는 한국어 이름과 금액 표시."""

OPTION_LABEL = {
    "sell_as_is": "현상태로 매각",
    "demolish_sell_land": "철거 후 토지 매각",
    "remodel": "리모델링",
    "keep": "현상태 유지",
}

REMODEL_VARIANT_LABEL = {
    "remodel_sell": "리모델링 후 매각",
    "remodel_rent": "리모델링 후 임대·보유",
    "remodel_live": "리모델링 후 거주·보유",
}

VERDICT_LABEL = {
    "recommend": "추천",
    "needs_quotes": "추가 견적·확인 필요",
    "insufficient_info": "정보 부족으로 판단 보류",
    "no_feasible": "조건에 맞는 실행 가능한 선택지 없음",
}

TIMING_MONTHS = {"within_3m": 3, "within_6m": 6, "within_12m": 12, "flexible": None}


def won(amount: float | None, signed: bool = False) -> str:
    """금액을 '3억 4,000만 원' 형태로."""
    if amount is None:
        return "산정 불가"
    sign = "-" if amount < 0 else ("+" if signed and amount > 0 else "")
    a = abs(round(amount))
    eok, man = a // 100_000_000, round((a % 100_000_000) / 10_000)
    if eok == 0 and man == 0:
        return "0원" if a == 0 else f"{sign}{a:,}원"
    parts = []
    if eok:
        parts.append(f"{eok:,}억")
    if man:
        parts.append(f"{man:,}만")
    return f"{sign}{' '.join(parts)} 원"


def area(sqm: float | None) -> str:
    if sqm is None:
        return "정보 없음"
    return f"{sqm:,.2f}".rstrip("0").rstrip(".") + f"㎡ (약 {sqm / (400 / 121):,.1f}평)"
