"""집 상태 점수 → 예상 집값 보정. 공인중개사가 현장을 보고 가격을 더하고 빼는 항목을 점수로 옮긴 것.

흐름: 공공자료 기본 예상가(valuation.py) × (1 + 상태 보정률) = 최종 예상가
- 점수는 항목별 정수(범위 고정), 항목별 1점당 보정률도 고정 → AI가 금액을 직접 만들지 않는다.
- 근거: 객관식 4문항(항상) + 주관식 설명(있으면). 주관식은 AI(제미나이 우선, 없으면 Claude — 키가 있을 때) 또는 키워드 규칙으로 점수화.
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


def _system_prompt() -> str:
    guide = "\n".join(f"- {k}: {v[0]} (점수 {v[1]}~{v[2]})" for k, v in FACTORS.items())
    return ("너는 부산 단독주택을 현장 확인하는 공인중개사다. 집주인이 쓴 설명을 읽고, 매매가에 영향을 주는 항목만 점수로 매긴다.\n"
            f"항목과 점수 범위:\n{guide}\n"
            "규칙: 글에 근거가 있는 항목만 넣는다(추측 금지). 0점은 넣지 않는다. 근거는 글에서 그대로 따온 20자 이내. 금액은 쓰지 않는다.")


def _collect(items) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for it in items or []:
        f, sc, ev = it.get("factor"), it.get("score"), str(it.get("evidence") or "")
        if f in FACTORS and isinstance(sc, (int, float)) and int(sc) != 0:
            out[f] = {"score": _clamp(f, int(sc)), "evidence": f"“{ev[:40]}”"}
    return out


class _Quota:
    """제미나이 무료 한도 지키기(서버 1대 기준 메모리). 하루 한도는 구글처럼 미국 태평양 시간 자정에 초기화.
    429(한도 초과)를 받으면 그날은 더 부르지 않는다."""

    def __init__(self):
        import threading
        self.lock = threading.Lock()
        self.day = None
        self.count = 0
        self.blocked = False
        self.recent: list[float] = []

    @staticmethod
    def _today():
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Los_Angeles")).date()

    def take(self) -> bool:
        import time
        with self.lock:
            d = self._today()
            if d != self.day:
                self.day, self.count, self.blocked = d, 0, False
            now = time.monotonic()
            self.recent = [t for t in self.recent if now - t < 60]
            if self.blocked or self.count >= settings.gemini_daily_limit or len(self.recent) >= settings.gemini_rpm_limit:
                return False
            self.count += 1
            self.recent.append(now)
            return True

    def exhausted(self):
        with self.lock:
            self.blocked = True


gemini_quota = _Quota()


def from_text_gemini(notes: str, answers: dict) -> dict[str, dict] | None:
    """구글 제미나이로 주관식 설명을 항목 점수로(JSON 스키마 고정 출력). 키가 없거나 실패하면 None."""
    if not settings.gemini_api_key:
        return None
    if not gemini_quota.take():
        log.info("제미나이 한도 도달 → 키워드 규칙")
        return None
    try:
        import httpx

        schema = {"type": "OBJECT", "properties": {"items": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "factor": {"type": "STRING", "enum": list(FACTORS)},
            "score": {"type": "INTEGER"},
            "evidence": {"type": "STRING"}}, "required": ["factor", "score", "evidence"]}}}, "required": ["items"]}
        body = {
            "systemInstruction": {"parts": [{"text": _system_prompt()}]},
            "contents": [{"role": "user", "parts": [{"text": f"객관식 답: {answers}\n집 설명:\n{notes[:2000]}"}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": schema},
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
        r = httpx.post(url, json=body, headers={"x-goog-api-key": settings.gemini_api_key}, timeout=30)
        if r.status_code == 429:
            gemini_quota.exhausted()
            log.warning("제미나이 무료 한도 초과(429) → 오늘은 키워드 규칙")
            return None
        r.raise_for_status()
        import json as _json
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        return _collect(_json.loads(text).get("items"))
    except Exception as e:  # noqa: BLE001 — AI 실패는 다음 방법으로
        log.warning("제미나이 상태 점수 실패: %s", type(e).__name__)
        return None


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
        text = from_text_gemini(notes, answers)
        if text is None:
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


def score_of(pct: float) -> int:
    """보정률을 0~100점으로(50점 = 공공자료 기본값 그대로, 0점 = 범위 바닥, 100점 = 범위 꼭대기)."""
    if pct < 0:
        return round(50 - 50 * pct / MIN_PCT)
    return round(50 + 50 * pct / MAX_PCT)


def apply(house: dict, assessment: dict | None) -> dict:
    """1) 공공자료로 대략 범위를 잡고 2) 답변 점수(0~100)로 그 범위 안의 자리를 골라 최종 예상가를 확정한다.
    범위는 방법별 최소~최대에, 상태가 가장 나쁠 때(−25%)·좋을 때(+12%)까지 넓힌 것."""
    if not assessment or not house.get("value"):
        return house
    v = house["value"]
    r = house.get("range") or {"min": v, "max": v}
    lo = min(r["min"], v * (1 + MIN_PCT / 100))
    hi = max(r["max"], v * (1 + MAX_PCT / 100))
    pct = assessment["pct"]
    final = v - (v - lo) * (pct / MIN_PCT) if pct < 0 else v + (hi - v) * (pct / MAX_PCT)
    out = dict(house)
    out["baseValue"] = v
    out["baseRange"] = {"min": lo, "max": hi}
    out["value"] = final
    out["range"] = None  # 점수로 확정했으므로 하나의 값
    out["condition"] = assessment | {"score": score_of(pct), "finalPct": round((final / v - 1) * 100, 1)}
    return out
