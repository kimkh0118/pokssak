"""추천 설명. 계산·추천 유형은 규칙 엔진이 정하고, AI 는 그 결과를 쉬운 말로 설명하는 역할만 한다.

AI 응답은 {"summary": str, "nextSteps": [str]} 스키마로 받고 서버에서 검증한다:
- 숫자(금액·비율 등)를 쓰지 못하게 한다(금액 생성·변경 방지)
- 웹 주소·전화번호·업체명 패턴 금지(임의 업체·연락처 방지)
- 상태와 맞지 않는 표현 금지(보류인데 '추천합니다', 지원 '확정' 등)
검증 실패나 장애 시 규칙 기반 설명을 쓴다.
"""

from __future__ import annotations

import json
import logging
import re

import httpx

from .settings import settings

log = logging.getLogger("explain")
STATUS_LABEL = {"conditional": "조건부 추천", "uncertain": "우열 불확실", "hold": "추천 보류"}
OPTION_LABEL = {"sell_as_is": "현 상태 판매", "demolish": "철거 후 토지 판매", "tie": "동률"}
FORBIDDEN = [r"\d", r"https?://", r"www\.", r"\d{2,4}-\d{3,4}-\d{4}", r"제휴", r"보장", r"확정", r"반드시", r"위험\s*점수", r"상승률"]


def rule_based(result: dict, direction: str | None) -> dict:
    status = result["status"]
    if status == "conditional":
        opt = OPTION_LABEL[result["executionRecommendation"]]
        summary = f"입력한 상담 가격·견적·비용 조건에서는 {opt}의 처리 비용 차감 예상 회수액이 더 크고, 가격·철거비를 ±10% 바꿔도 결과가 같습니다."
        steps = ["상담 가격과 견적의 기준일·조건이 바뀌면 다시 계산하세요.", "실행 전 계약 조건·세금을 전문가와 최종 확인하세요."]
    elif status == "uncertain":
        summary = "필요한 입력은 갖춰졌지만 회수액 범위가 겹치거나 가격·철거비가 조금만 달라져도 우열이 바뀝니다."
        steps = ["철거비 손익분기점과 실제 견적의 차이를 확인하세요.", "두 판매 방식의 가격 상담을 같은 시점·조건으로 다시 받아 보세요."]
    else:
        summary = "추천에 필요한 근거가 부족해 판단을 보류했습니다. 현상태 유지가 최선이라는 뜻은 아닙니다."
        steps = [f"{m}" for m in result["missing"][:4]] or ["상담 가격·견적을 입력하세요."]
    if direction == "fast":
        steps.append("빠른 매각을 원하시면 공인중개사에게 예상 매각 기간을 함께 문의하세요(기간·가격을 임의로 줄이지 않았습니다).")
    return {"summary": summary, "nextSteps": steps, "source": "rule"}


def validate(candidate: dict, status: str) -> list[str]:
    errors = []
    if not isinstance(candidate, dict) or not isinstance(candidate.get("summary"), str) or not isinstance(candidate.get("nextSteps"), list):
        return ["스키마 불일치"]
    text = candidate["summary"] + " " + " ".join(str(x) for x in candidate["nextSteps"])
    for pat in FORBIDDEN:
        if re.search(pat, text):
            errors.append(f"금지 표현: {pat}")
    if status != "conditional" and re.search(r"추천합니다|추천드립니다", text):
        errors.append("허용되지 않은 추천 표현")
    return errors


def ai_explain(result: dict, direction: str | None) -> dict:
    """AI 설명(키가 있을 때). 실패하면 규칙 기반 설명."""
    fallback = rule_based(result, direction)
    if not settings.anthropic_api_key:
        return fallback
    facts = {"status": STATUS_LABEL[result["status"]], "leader": OPTION_LABEL.get(result["computedLeader"] or "", None),
             "execution": OPTION_LABEL.get(result["executionRecommendation"] or "", None),
             "missing": result["missing"][:6], "direction": direction}
    prompt = ("다음은 규칙 엔진이 정한 빈집 처리 비교 결과입니다. 이 결과를 바꾸지 말고 비전문가에게 쉬운 한국어로 설명하세요. "
              "숫자·금액·업체명·연락처·웹주소를 쓰지 말고, 지원금이 확정된다고 말하지 마세요. "
              'JSON 으로만 답하세요: {"summary": "두 문장 이내", "nextSteps": ["다음 행동", ...]}\n' + json.dumps(facts, ensure_ascii=False))
    try:
        r = httpx.post("https://api.anthropic.com/v1/messages", timeout=20, headers={
            "x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": settings.llm_model, "max_tokens": 600, "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        text = r.json()["content"][0]["text"]
        candidate = json.loads(text[text.find("{"): text.rfind("}") + 1])
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 규칙 기반으로
        log.warning("AI 설명 실패: %s", type(e).__name__)
        return {**fallback, "aiError": "AI 설명을 받지 못해 규칙 기반 설명을 표시합니다."}
    errors = validate(candidate, result["status"])
    if errors:
        return {**fallback, "aiError": "AI 설명이 검증을 통과하지 못해 규칙 기반 설명을 표시합니다."}
    return {"summary": candidate["summary"], "nextSteps": candidate["nextSteps"][:5], "source": "ai"}
