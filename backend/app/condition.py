"""집 상태 점수 → 예상 집값 보정. 공인중개사가 현장을 보고 가격을 더하고 빼는 항목을 점수로 옮긴 것.

흐름: 공공자료 기본 예상가(valuation.py) × (1 + 상태 보정률) = 최종 예상가
- 점수는 항목별 정수(범위 고정), 항목별 1점당 보정률도 고정 → AI가 금액을 직접 만들지 않는다.
- 근거: 객관식 4문항(항상) + 주관식 설명(있으면). 주관식은 AI(키가 있을 때) 또는 키워드 규칙으로 점수화.
- 결과는 답변을 낼 때 한 번 계산해 분석에 저장한다(매일 가격 확인 때는 다시 부르지 않음 → 같은 입력엔 같은 값).
보정률 계수는 감정평가 건물 개별요인·중개 현장 관행을 단순화한 개발 설정값이며, 화면에 항목별 근거를 모두 보여준다.
"""

from __future__ import annotations

import logging
import re

from .settings import settings

log = logging.getLogger("condition")

# key: (이름, 최소점, 최대점, 1점당 보정 %)
FACTORS: dict[str, tuple[str, int, int, float]] = {
    "maintenance": ("관리·노후 상태", -2, 2, 3.0),
    "structure": ("누수·균열·구조 문제", -2, 0, 5.0),
    "roof": ("지붕(슬레이트·누수)", -2, 0, 3.0),
    "renovation": ("수리·리모델링", 0, 2, 3.0),
    "access": ("진입로·주차", -2, 1, 3.0),
    "occupancy": ("세입자·짐(바로 못 비움)", -2, 0, 3.0),
    "rights": ("공동명의·권리관계", -2, 0, 2.0),
    "environment": ("주변 환경(일조·소음 등)", -1, 1, 2.0),
}
MIN_PCT, MAX_PCT = -25.0, 12.0

# 키워드 규칙(키가 없을 때 주관식 해석). (항목, 점수, 정규식)
RULES: list[tuple[str, int, str]] = [
    ("structure", -2, r"붕괴|기울|금이\s*크|구조\s*(위험|문제)|기둥|벽.*무너"),
    ("structure", -1, r"누수|새요|샌다|새는|새서|새고|균열|금\s*(이\s*)?(가|갔)|곰팡이|습기|결로"),
    ("roof", -2, r"슬레이트|석면"),
    ("roof", -1, r"지붕.{0,10}(새|낡|파손|부서)|기와.{0,6}(깨|파손)"),
    ("renovation", 2, r"리모델링|전면\s*수리|올\s*수리|새로\s*고쳤"),
    ("renovation", 1, r"(도배|장판|싱크대|보일러|창호|화장실).*(새로|교체|수리)|부분\s*수리"),
    ("renovation", 1, r"수리\s*(했|함|완료)|고쳤어|손\s*봤"),
    ("maintenance", 2, r"관리\s*(가\s*)?잘|깨끗|상태\s*(가\s*)?좋|바로\s*살\s*수"),
    ("maintenance", -1, r"낡|오래\s*됐|노후|손\s*볼\s*곳"),
    ("maintenance", -2, r"폐가|흉가|사람\s*못\s*살|엉망|방치"),
    ("access", -2, r"차\s*(가\s*)?(못|안)\s*(들어|다니)|계단\s*(으로만|길)|맹지"),
    ("access", -1, r"골목|좁은\s*길|주차\s*(가\s*)?(안|불가|어려)|언덕|비탈"),
    ("access", 1, r"큰\s*길|대로변|주차\s*(가능|됨|돼|넉넉)|역\s*(가까|근처)"),
    ("occupancy", -2, r"세입자.*(안\s*나|분쟁|못\s*내보)|무단\s*점유"),
    ("occupancy", -1, r"세입자|임차인|짐\s*(이|가)?\s*(많|가득|남아)|물건\s*(이|가)?\s*많"),
    ("rights", -2, r"상속\s*(분쟁|정리\s*안)|소송|압류|가압류|경매"),
    ("rights", -1, r"공동\s*명의|형제|남매|공유|상속"),
    ("environment", 1, r"조망|햇볕\s*잘|남향|공원|학교\s*가까|조용"),
    ("environment", -1, r"소음|냄새|공장|무덤|묘지|철탑|고압선|어둡"),
]


def _clamp(key: str, v: int) -> int:
    _, lo, hi, _ = FACTORS[key]
    return max(lo, min(hi, int(v)))


def from_choices(answers: dict) -> dict[str, dict]:
    """객관식 답에서 나오는 기본 점수(주관식이 같은 항목을 말하면 주관식이 우선)."""
    s: dict[str, dict] = {}
    cond = {"usable": 1, "old": -1, "severe": -2}.get(answers.get("condition") or "")
    if cond is not None:
        s["maintenance"] = {"score": cond, "evidence": "질문: 집 상태"}
    acc = {"good": 1, "narrow": -1, "none": -2}.get(answers.get("access") or "")
    if acc is not None:
        s["access"] = {"score": acc, "evidence": "질문: 진입로"}
    if answers.get("usage") in ("occupied", "storage"):
        s["occupancy"] = {"score": -1, "evidence": "질문: 사람이 살거나 짐이 있음"}
    if answers.get("ownership") in ("joint", "other") or answers.get("ownerMismatch"):
        s["rights"] = {"score": -1, "evidence": "질문: 공동·기타 소유"}
    return s


def from_text_rules(notes: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for key, score, pat in RULES:
        m = re.search(pat, notes)
        if not m:
            continue
        cur = out.get(key)
        # 같은 항목은 더 강한(절댓값 큰) 근거를 쓴다
        if not cur or abs(score) > abs(cur["score"]):
            out[key] = {"score": score, "evidence": f"“{m.group(0)}”"}
    return out


def from_text_ai(notes: str, answers: dict) -> dict[str, dict] | None:
    """Claude 로 주관식 설명을 항목 점수로 바꾼다. 키가 없거나 실패하면 None(→ 키워드 규칙)."""
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        from pydantic import BaseModel, Field

        class Item(BaseModel):
            factor: str = Field(description="항목 키: " + ", ".join(FACTORS))
            score: int
            evidence: str = Field(description="사용자 글에서 그대로 따온 짧은 근거(20자 이내)")

        class Out(BaseModel):
            items: list[Item]

        guide = "\n".join(f"- {k}: {v[0]} (점수 {v[1]}~{v[2]})" for k, v in FACTORS.items())
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=30, max_retries=1)
        resp = client.messages.parse(
            model=settings.llm_model,
            max_tokens=2000,
            output_config={"effort": "low"},
            system=("너는 부산 단독주택을 현장 확인하는 공인중개사다. 집주인이 쓴 설명을 읽고, 매매가에 영향을 주는 항목만 점수로 매긴다.\n"
                    f"항목과 점수 범위:\n{guide}\n"
                    "규칙: 글에 근거가 있는 항목만 넣는다(추측 금지). 0점은 넣지 않는다. 근거는 글에서 그대로 따온다. 금액은 쓰지 않는다."),
            messages=[{"role": "user", "content": f"객관식 답: {answers}\n집 설명:\n{notes[:2000]}"}],
            output_format=Out,
        )
        if resp.stop_reason == "refusal" or not resp.parsed_output:
            return None
        out: dict[str, dict] = {}
        for it in resp.parsed_output.items:
            if it.factor in FACTORS and it.score != 0:
                out[it.factor] = {"score": _clamp(it.factor, it.score), "evidence": f"“{it.evidence[:40]}”"}
        return out
    except Exception as e:  # noqa: BLE001 — AI 실패는 규칙으로 대신
        log.warning("AI 상태 점수 실패: %s", type(e).__name__)
        return None


def assess(answers: dict, notes: str | None) -> dict:
    """최종 상태 점수와 보정률. answers 에 저장해 두고 계산 때 apply() 로 쓴다."""
    scores = from_choices(answers)
    source = "choices"
    notes = (notes or "").strip()
    if notes:
        text = from_text_ai(notes, answers)
        source = "ai" if text is not None else "rules"
        if text is None:
            text = from_text_rules(notes)
        for k, v in text.items():
            scores[k] = v | {"fromText": True}
    items = []
    total = 0.0
    for key, (label, lo, hi, step) in FACTORS.items():
        if key not in scores:
            continue
        sc = _clamp(key, scores[key]["score"])
        if sc == 0:
            continue
        pct = sc * step
        total += pct
        items.append({"key": key, "label": label, "score": sc, "pct": pct, "evidence": scores[key]["evidence"]})
    pct = max(MIN_PCT, min(MAX_PCT, total))
    return {"pct": round(pct, 1), "items": items, "source": source, "notes": notes or None,
            "capped": pct != total}


def apply(house: dict, assessment: dict | None) -> dict:
    """기본 예상가에 상태 보정을 곱한다. 기본값은 baseValue 로 남겨 화면에 함께 보여준다."""
    if not assessment or not house.get("value"):
        return house
    f = 1 + assessment["pct"] / 100
    out = dict(house)
    out["baseValue"] = house["value"]
    out["value"] = house["value"] * f
    if house.get("range"):
        out["range"] = {"min": house["range"]["min"] * f, "max": house["range"]["max"] * f}
    out["condition"] = assessment
    return out
