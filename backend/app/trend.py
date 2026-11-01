"""지금까지의 가격 변동(그래프용). 예측이 아니라 기록만 정리한다.

- 공식 가격: 이 집 개별주택가격(연도별), 이 땅 공시지가 × 대지 면적(연도별)
- 동네 실거래: 같은 법정동 단독·다가구 / 토지(지목 같음) 거래의 대지 ㎡당 가격 분기별 중앙값과 건수
"""

from __future__ import annotations

from statistics import median


def _quarter(date: str) -> str | None:
    try:
        y, m = int(date[:4]), int(date[5:7])
    except (TypeError, ValueError):
        return None
    return f"{y}-Q{(m - 1) // 3 + 1}"


def _pct(first: float | None, last: float | None) -> float | None:
    return round((last / first - 1) * 100, 1) if first and last else None


def official(land: dict, house_price: dict | None, area: float | None) -> dict:
    land_hist = (land or {}).get("history") or []
    hp = (house_price or {}).get("data") if (house_price or {}).get("ok") else None
    house_hist = (hp or {}).get("history") or []
    years = sorted({x["year"] for x in land_hist} | {x["year"] for x in house_hist})
    lmap = {x["year"]: x["price"] * area for x in land_hist} if area else {}
    hmap = {x["year"]: x["price"] for x in house_hist}
    points = [{"year": y, "house": hmap.get(y), "land": lmap.get(y)} for y in years if hmap.get(y) or lmap.get(y)]

    def change(key, span):
        vals = [p for p in points if p[key]]
        if len(vals) < 2:
            return None
        last = vals[-1]
        base = next((p for p in vals if p["year"] >= last["year"] - span), vals[0])
        return {"from": base["year"], "to": last["year"], "pct": _pct(base[key], last[key])} if base is not last else None
    return {"points": points, "change": {"house5": change("house", 5), "land5": change("land", 5)}}


def trades(house_trades: dict, land_trades: dict, subject: dict, months: list[str] | None = None) -> dict:
    """같은 동 거래의 분기별 ㎡당 중앙값. 건수가 적은 분기는 그대로 표시하되 건수를 함께 준다."""
    def series(trades: dict, kind: str) -> dict[str, list[float]]:
        out: dict[str, list[float]] = {}
        if not (trades or {}).get("ok"):
            return out
        for t in trades["data"]:
            if t.get("cancelled") or t.get("shareDeal") or not t.get("amountWon") or not t.get("landArea"):
                continue
            if t.get("umdNm") != subject.get("umdNm"):
                continue
            if kind == "land" and (t.get("jimok") or "") != (subject.get("jimok") or "대"):
                continue
            q = _quarter(t.get("dealDate") or "")
            if q:
                out.setdefault(q, []).append(t["amountWon"] / t["landArea"])
        return out
    h, l = series(house_trades, "house"), series(land_trades, "land")
    # 거래가 없는 분기도 축에 넣는다(빠지면 기간이 실제보다 짧아 보임). months: 조회한 계약년월 YYYYMM
    span = {f"{m[:4]}-Q{(int(m[4:6]) - 1) // 3 + 1}" for m in (months or []) if len(m) == 6}
    quarters = sorted(set(h) | set(l) | span)
    points = [{"quarter": q, "houseUnit": median(h[q]) if q in h else None, "houseN": len(h.get(q, [])),
               "landUnit": median(l[q]) if q in l else None, "landN": len(l.get(q, []))} for q in quarters]
    return {"points": points, "umdNm": subject.get("umdNm")}
