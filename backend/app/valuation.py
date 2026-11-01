"""공인중개사 방식에 가까운 집값·땅값 추정.

중개사가 실제로 쓰는 세 가지를 함께 계산하고 가중 평균한다(현장 상태·수요는 반영 못 함 → 상담 가격이 있으면 그 값을 우선).
  1) 거래사례비교: 같은 동 비슷한 주택 거래의 대지 ㎡당 가격 × 이 집 면적 × 개별요인(도로·형상·경사) × 연식 보정
  2) 원가법: 같은 용도지역 토지 거래로 땅값 + 건물 잔존가치(구조·연식) − 낡은 집의 철거 부담(매수자가 깎는 몫)
  3) 공시가격 비율: 개별주택가격 × (동네 토지 시세 ÷ 이 땅 공시지가)
보정 계수는 감정평가 개별요인 관행을 단순화한 개발 설정값이며, 모든 근거를 화면에 보여준다.
"""

from __future__ import annotations

from datetime import date
from statistics import median

# 도로접면: '소로한면'(폭 8~12m 도로에 한 면)을 1.00 으로 본 상대 계수
# (계수는 _road_factor 참고: 광대 1.15 · 중로 1.08 · 소로 1.00 · 세로(가) 0.93 · 세로(불) 0.85 · 맹지 0.70, 각지 +0.03)
SHAPE = {"정방형": 1.00, "가로장방": 1.00, "세로장방": 0.98, "사다리형": 0.97, "삼각형": 0.92, "역삼각형": 0.90,
         "부정형": 0.93, "자루형": 0.85}
SLOPE = {"평지": 1.00, "저지": 0.97, "완경사": 0.97, "고지": 0.95, "급경사": 0.88}
# 구조별 신축 단가(원/㎡)와 경제적 내용연수(년) — 개발 설정값
STRUCTURE = (("철근콘크리트", 1_900_000, 50), ("철골철근", 1_900_000, 50), ("철골", 1_400_000, 40), ("경량철골", 1_300_000, 30),
             ("벽돌", 1_500_000, 40), ("조적", 1_500_000, 40), ("블록", 1_300_000, 35), ("목조", 1_300_000, 30))
DEFAULT_STRUCTURE = ("기타·미상", 1_500_000, 40)
# 낡은 집 매수자가 깎는 철거 부담: 예상 철거비(demolition.py)와 같은 구조별 단가의 가운데 값을 쓴다
BUYER_SHARE = 0.5                # 낡은 집 매수자는 철거 부담의 절반 정도를 가격에서 뺀다고 가정
NATIONAL_RATIO = 1.8             # 동네 토지 거래가 없을 때 쓰는 시세/공시 비율 가정(단독주택 공시가 현실화율 약 55%)
WEIGHTS = {"comparable": 0.45, "cost": 0.35, "official": 0.20}


def _road_factor(name: str | None) -> tuple[float, str]:
    """브이월드 도로접면 값(예: 광대로한면, 중로각지, 세로한면(가), 세로각지(불), 맹지)을 계수로."""
    if not name:
        return 1.0, "도로 정보 없음"
    if "맹지" in name:
        return 0.70, name
    if name.startswith("광대"):
        f = 1.15
    elif name.startswith("중로"):
        f = 1.08
    elif name.startswith("소로"):
        f = 1.00
    elif name.startswith("세로"):
        f = 0.85 if "(불)" in name else 0.93  # (불): 차가 못 들어가는 좁은 길
    else:
        return 1.0, name
    corner = 0.03 if ("각지" in name or "-" in name) else 0.0  # 두 면 이상 도로에 접함
    return round(f + corner, 3), name


def land_factor(land: dict) -> tuple[float, list[dict]]:
    """이 땅의 개별요인(비교 사례 평균을 보통으로 본 상대값). 합성 계수는 0.6~1.3 으로 제한."""
    items = []
    road, road_label = _road_factor(land.get("roadSideCodeNm"))
    items.append({"label": f"도로 접면: {road_label}", "factor": road})
    shape = SHAPE.get(land.get("tpgrphFrmCodeNm") or "", 1.0)
    items.append({"label": f"땅 모양: {land.get('tpgrphFrmCodeNm') or '정보 없음'}", "factor": shape})
    slope = SLOPE.get(land.get("tpgrphHgCodeNm") or "", 1.0)
    items.append({"label": f"경사: {land.get('tpgrphHgCodeNm') or '정보 없음'}", "factor": slope})
    total = min(1.3, max(0.6, road * shape * slope))
    return total, items


def _zone(s: str | None) -> str:
    return (s or "").replace("지역", "").replace(" ", "")


def land_unit_price(land_trades: dict, subject: dict, base_months: list[str], ext_months: list[str]) -> dict:
    """같은 동·지목·용도지역 토지 거래의 ㎡당 중앙값. 부족하면 24개월 → 용도지역 무시 순으로 넓히고 그 사실을 남긴다."""
    if not land_trades.get("ok"):
        return {"unit": None, "n": 0, "note": "토지 거래 조회 실패"}
    rows = [t for t in land_trades["data"] if t.get("kind") == "land" and t.get("amountWon") and t.get("landArea")
            and not t.get("shareDeal") and not t.get("cancelled") and t.get("umdNm") == subject.get("umdNm")
            and (t.get("jimok") or "") == (subject.get("jimok") or "대")]
    area = subject.get("landArea") or 0
    rows = [t for t in rows if area and 0.5 <= t["landArea"] / area <= 2.0]
    zone = _zone(subject.get("zoning"))
    tries = [(base_months, True, "같은 용도지역·최근 12개월"), (ext_months, True, "같은 용도지역·최근 24개월"),
             (base_months, False, "용도지역 구분 없이 최근 12개월(같은 용도지역 거래 부족)"),
             (ext_months, False, "용도지역 구분 없이 최근 24개월(같은 용도지역 거래 부족)")]
    for months, same_zone, note in tries:
        ym = set(months)
        pick = [t for t in rows if (t.get("dealDate") or "")[:7].replace("-", "") in ym
                and (not same_zone or not zone or _zone(t.get("zoning")).startswith(zone[:4]))]
        if len(pick) >= 2 or (pick and not same_zone):
            return {"unit": median(t["amountWon"] / t["landArea"] for t in pick), "n": len(pick), "note": note}
    return {"unit": None, "n": 0, "note": "비교할 토지 거래 없음"}


def _structure(name: str | None) -> tuple[str, int, int]:
    for key, cost, life in STRUCTURE:
        if name and key in name:
            return key, cost, life
    return DEFAULT_STRUCTURE


def estimate(subject: dict, land: dict, building: dict | None, house_ref: dict, land_trades: dict,
             house_price: dict | None, months: dict, today: date) -> dict:
    """subject: {umdNm, landArea, buildYear, jimok}. 반환: {house: {...}, land: {...}} (값이 없으면 value None)"""
    area = subject.get("landArea")
    subject = subject | {"zoning": land.get("prposArea1Nm")}
    factor, factor_items = land_factor(land)
    lu = land_unit_price(land_trades, subject, months["base"], months["extended"])
    official_land = land.get("pblntfPclnd")
    ratio = None
    if lu["unit"] and official_land:
        ratio = min(3.0, max(1.0, lu["unit"] / official_land))

    # ---- 땅값(철거 후 토지)
    land_methods = []
    if lu["unit"] and area:
        land_methods.append({"key": "comparable", "name": "토지 거래 비교", "value": lu["unit"] * area * factor, "weight": 0.75,
                             "detail": f"{lu['note']} {lu['n']}건 ㎡당 중앙값 {lu['unit']:,.0f}원 × {area}㎡ × 개별요인 {factor:.2f}"})
    if official_land and area:
        r = ratio or NATIONAL_RATIO
        land_methods.append({"key": "official", "name": "공시지가 비율", "value": official_land * area * r, "weight": 0.25,
                             "detail": f"공시지가 ㎡당 {official_land:,.0f}원 × {area}㎡ × 시세/공시 {r:.2f}"
                                       + ("" if ratio else "(동네 거래 없어 전국 가정값)")})
    land_est = _combine(land_methods)
    land_est["factors"] = factor_items

    # ---- 집값(현 상태, 토지+건물)
    methods = []
    used = [d for d in (house_ref.get("decisions") or []) if d.get("included") and d.get("unitPrice")]
    if used and area:
        unit = median(d["unitPrice"] for d in used)
        years = [d["trade"].get("buildYear") for d in used if d["trade"].get("buildYear")]
        age_f, age_note = 1.0, ""
        if years and subject.get("buildYear"):
            gap = subject["buildYear"] - median(years)
            age_f = min(1.15, max(0.85, 1 + 0.007 * gap))
            age_note = f" × 연식 보정 {age_f:.2f}(비교 사례보다 {abs(gap):.0f}년 {'새 집' if gap >= 0 else '오래됨'})"
        methods.append({"key": "comparable", "name": "비슷한 주택 거래 비교", "value": unit * area * factor * age_f,
                        "weight": WEIGHTS["comparable"] * (1 if len(used) >= 3 else 0.55),
                        "detail": f"같은 동 {len(used)}건 대지 ㎡당 중앙값 {unit:,.0f}원 × {area}㎡ × 개별요인 {factor:.2f}{age_note}"})
    if land_est["value"]:
        b = building or {}
        floor = b.get("totArea") or 0
        sname, cost, life = _structure(b.get("strctCdNm"))
        age = (today.year - subject["buildYear"]) if subject.get("buildYear") else None
        residual, burden = 0.0, 0.0
        if floor and age is not None:
            residual = cost * floor * max(0.0, 1 - age / life)
            if age >= life * 0.8:  # 낡은 집: 매수자가 철거 부담 일부를 깎는다
                from .demolition import _unit
                lo, hi = _unit(b.get("strctCdNm"))[1]
                burden = (lo + hi) / 2 * floor * BUYER_SHARE
        value = max(land_est["value"] * 0.5, land_est["value"] + residual - burden)
        methods.append({"key": "cost", "name": "땅값 + 남은 건물값", "value": value, "weight": WEIGHTS["cost"],
                        "detail": f"땅값 {land_est['value']:,.0f}원 + 건물 잔존 {residual:,.0f}원({sname}, "
                                  f"{'연식 미상' if age is None else f'{age}년/내용연수 {life}년'})"
                                  + (f" − 철거 부담 {burden:,.0f}원(매수자 몫)" if burden else "")})
    hp = (house_price or {}).get("data") if (house_price or {}).get("ok") else None
    if hp and hp.get("housePc"):
        r = ratio or NATIONAL_RATIO
        methods.append({"key": "official", "name": "공시가격 비율", "value": hp["housePc"] * r, "weight": WEIGHTS["official"],
                        "detail": f"{hp['stdrYear']}년 개별주택가격 {hp['housePc']:,.0f}원 × 시세/공시 {r:.2f}"
                                  + ("" if ratio else "(동네 거래 없어 전국 가정값)")})
    house_est = _combine(methods)
    house_est["factors"] = factor_items
    house_est["officialPrice"] = hp
    return {"house": house_est, "land": land_est}


def _combine(methods: list[dict]) -> dict:
    """가중 평균을 가운데 값으로, 방법별 최소~최대를 범위로. 방법 간 차이가 크면 확인 필요로 표시."""
    ms = [m for m in methods if m["value"] and m["value"] > 0]
    if not ms:
        return {"value": None, "range": None, "methods": methods, "agreement": None}
    total = sum(m["weight"] for m in ms)
    value = sum(m["value"] * m["weight"] for m in ms) / total
    lo, hi = min(m["value"] for m in ms), max(m["value"] for m in ms)
    if len(ms) == 1:
        lo, hi = value * 0.9, value * 1.1
    spread = hi / lo if lo else None
    agreement = "single" if len(ms) == 1 else "good" if spread and spread <= 1.3 else "check"
    for m in ms:
        m["share"] = round(m["weight"] / total, 2)
    return {"value": value, "range": {"min": lo, "max": hi}, "methods": methods, "agreement": agreement}
