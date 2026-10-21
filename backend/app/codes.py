"""식별자·코드·단위 변환."""

from __future__ import annotations

import re

SQM_PER_PYEONG = 400 / 121  # 1평 = 400/121 ㎡


def pnu_from_address(adm_cd: str, mt_yn: str, bun: int | None, ji: int | None) -> str | None:
    """PNU 19자리 = 법정동코드 10 + 대장구분 1 + 본번 4 + 부번 4.
    주소 API 의 산 여부(mtYn) '0'(대지)→'1'(일반), '1'(산)→'2'(산). 도로명 건물번호가 아니라 지번 본번·부번을 쓴다."""
    if not re.fullmatch(r"\d{10}", adm_cd or "") or bun is None:
        return None
    if mt_yn not in ("0", "1"):
        return None
    return f"{adm_cd}{'2' if mt_yn == '1' else '1'}{int(bun):04d}{int(ji or 0):04d}"


def parse_pnu(pnu: str) -> dict:
    if not re.fullmatch(r"\d{19}", pnu or ""):
        raise ValueError("PNU는 19자리 숫자여야 합니다.")
    return {
        "admCd": pnu[:10], "sigunguCd": pnu[:5], "bjdongCd": pnu[5:10],
        "mountain": pnu[10] == "2",
        "platGbCd": "1" if pnu[10] == "2" else "0",  # 건축물대장: 0 대지, 1 산
        "bun": pnu[11:15], "ji": pnu[15:19],
    }


def is_busan(adm_cd: str | None) -> bool:
    return bool(adm_cd) and adm_cd.startswith("26")


def manwon_to_won(v: float) -> int:
    return round(v * 10_000)


def pyeong_to_sqm(v: float) -> float:
    return v * SQM_PER_PYEONG


def sqm_to_pyeong(v: float) -> float:
    return v / SQM_PER_PYEONG


def num(v) -> float | None:
    """'12,345' → 12345.0 / 빈 값 → None (0이 아님)."""
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    try:
        return float(s) if s else None
    except ValueError:
        return None


def text(v) -> str | None:
    s = "" if v is None else str(v).strip()
    return s or None


def won(amount: float | None, signed: bool = False) -> str:
    if amount is None:
        return "미확인"
    sign = "-" if amount < 0 else ("+" if signed and amount > 0 else "")
    a = abs(round(amount))
    eok, man = a // 100_000_000, round((a % 100_000_000) / 10_000)
    if eok == 0 and man == 0:
        return "0원" if a == 0 else f"{sign}{a:,}원"
    return sign + " ".join(p for p in (f"{eok:,}억" if eok else "", f"{man:,}만" if man else "") if p) + " 원"
