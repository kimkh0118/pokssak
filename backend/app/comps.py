"""실거래 정제·유사 거래 선정·참고가격.

주택 거래와 토지 거래는 별도 집단이다.
기본 집단: 같은 법정동 · 최근 12개월. 24개월 확대 집단은 따로 표시한다.
인접동 집단은 검증된 경계자료가 없어 사용하지 않는다.
개발 설정(공식 감정평가 기준 아님): 면적 70~130%, 주택 건축연도 차이 10년 이내.
가격이 높거나 낮다는 이유만으로 사례를 지우지 않는다.

참고가격
- 현 상태 주택(H): 유사 주택 '건물+토지 일괄' 거래금액 ÷ 그 거래의 대지면적 → 중앙값 × 대상 대지면적 (토지가격을 다시 더하지 않음)
- 철거 후 토지(L): 유사 토지 거래금액 ÷ 거래면적 → 중앙값 × 대상 토지면적
- 0건: 산정 보류 / 1건: 단일 사례 환산값 / 여러 건: 중앙값과 관측 최소~최대 환산값
  관측 범위는 판매가격의 예측구간이나 신뢰구간이 아니다.
"""

from __future__ import annotations

from statistics import median

RULE = {"areaRatio": (0.7, 1.3), "buildYearGap": 10, "baseMonths": 12, "extendedMonths": 24}


def _dup_key(t: dict):
    return (t["dealDate"], t.get("amountWon"), t.get("landArea"), t.get("jibunMasked"), t.get("floorArea"))


def _judge(t: dict, subject: dict, kind: str) -> str | None:
    """제외 사유. 통과면 None."""
    if t.get("cancelled"):
        return "해제된 거래"
    if t.get("shareDeal"):
        return "지분 거래"
    if not t.get("amountWon"):
        return "거래금액 없음"
    if not t.get("landArea"):
        return "면적 없음"
    if kind == "land" and (t.get("jimok") or "") != (subject.get("jimok") or "대"):
        return f"지목 다름({t.get('jimok') or '미상'})"
    if kind == "house" and t.get("houseType") and t["houseType"] not in ("단독", "다가구"):
        return f"주택 유형 다름({t['houseType']})"
    lo, hi = RULE["areaRatio"]
    ratio = t["landArea"] / subject["landArea"]
    if not lo <= ratio <= hi:
        return f"면적 비교 범위 밖({ratio:.0%})"
    if kind == "house" and subject.get("buildYear") and t.get("buildYear"):
        gap = abs(subject["buildYear"] - t["buildYear"])
        if gap > RULE["buildYearGap"]:
            return f"건축연도 차이 {gap}년"
    return None


def select(kind: str, trades: list[dict], subject: dict, months: list[str]) -> dict:
    """months: 이 집단에 포함할 계약년월(YYYYMM). subject: {umdNm, landArea, buildYear, jimok}"""
    allowed = set(months)
    seen = set()
    decisions = []
    for t in trades:
        ym = t["dealDate"][:7].replace("-", "")
        if ym not in allowed:
            continue
        if t.get("umdNm") != subject.get("umdNm"):
            continue  # 기본 집단은 같은 법정동만(인접동 미사용)
        reason = _judge(t, subject, kind) if subject.get("landArea") else "대상 면적 미확인"
        key = _dup_key(t)
        if reason is None and key in seen:
            reason = "중복 신고로 보이는 거래"
        seen.add(key)
        unit = t["amountWon"] / t["landArea"] if t.get("amountWon") and t.get("landArea") else None
        decisions.append({"trade": t, "included": reason is None, "reason": reason or "기준 충족", "unitPrice": unit})
    return decisions


def reference_price(kind: str, trades: dict, subject: dict, base_months: list[str], extended_months: list[str]) -> dict:
    """trades: 어댑터 결과({ok, data, failedMonths...}). 실패한 달이 있으면 표시하고 0건으로 보지 않는다."""
    label = "현 상태 주택(건물+토지 일괄)" if kind == "house" else "철거 후 토지"
    out = {"kind": kind, "label": label, "rule": RULE, "status": "withheld", "value": None, "range": None,
           "sampleSize": 0, "decisions": [], "extended": None, "notes": [], "unit": "원"}
    if not trades["ok"]:
        out["notes"].append(f"거래 자료 조회 실패: {trades['error']['message']}")
        return out
    if trades.get("failedMonths"):
        out["notes"].append(f"일부 달 조회 실패({', '.join(trades['failedMonths'])}) — 해당 달은 0건이 아니라 미확인")
    if not subject.get("landArea"):
        out["notes"].append("대상 면적이 확인되지 않아 환산할 수 없습니다.")
        return out

    base = select(kind, trades["data"], subject, base_months)
    out["decisions"] = base
    used = [d for d in base if d["included"]]
    out["sampleSize"] = len(used)
    area = subject["landArea"]
    if not used:
        out["notes"].append("같은 법정동 최근 12개월 비교 사례가 없어 산정을 보류합니다. 상담 가격을 입력하면 비교할 수 있습니다.")
    elif len(used) == 1:
        out.update(status="single", value=used[0]["unitPrice"] * area)
        out["notes"].append("비교 사례가 1건뿐입니다. 단일 사례의 면적당 가격을 환산한 값입니다.")
    else:
        units = sorted(d["unitPrice"] for d in used)
        out.update(status="median", value=median(units) * area, range={"min": units[0] * area, "max": units[-1] * area})
        out["notes"].append("관측된 사례의 최소~최대 환산값이며 판매가격의 예측구간이 아닙니다.")

    ext = [d for d in select(kind, trades["data"], subject, extended_months) if d["included"]]
    if len(ext) > len(used):
        units = sorted(d["unitPrice"] for d in ext)
        out["extended"] = {"sampleSize": len(ext), "value": median(units) * area,
                           "range": {"min": units[0] * area, "max": units[-1] * area},
                           "note": "24개월 확대 집단(기본 집단과 별도 참고)"}
    return out
