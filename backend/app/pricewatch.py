"""내 자산 예상 가격 변동 알림(앱 알림함 + 웹 푸시).

매일(기본 09:00 한국 시간 이후 하루 1번) 내 자산의 공공자료를 다시 조회해 중개사 방식 예상 가격을 새로 계산한다.
- 예상 가격: 직전 기록보다 PRICE_ALERT_PCT(기본 3%) 이상 바뀌고, 비교 거래가 PRICE_ALERT_MIN_SAMPLES(기본 3)건 이상일 때만 알림
  (거래 한두 건 때문에 출렁이는 값은 알리지 않음)
- 공시가격: 새 연도 개별주택가격이 나오면 변동률과 함께 따로 알림(1년에 한 번)
처음 저장할 때 기준값을 남기며 그때는 알리지 않는다.

수동 실행:  backend/.venv/bin/python -m app.pricewatch      (작업 디렉터리: backend)
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from datetime import timedelta

from . import analyses, db as dbm, property as prop, push
from .clock import KST, now, now_iso
from .settings import settings

log = logging.getLogger("pricewatch")


def _values(analysis_id: str) -> dict | None:
    with dbm.connect() as c:
        row = c.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if not row:
        return None
    a = analyses.compute(row)
    ref = a["reference"]
    lk = prop.get_lookup(row["lookup_id"]) or {}
    hp = (lk.get("housePrice") or {}).get("data") if (lk.get("housePrice") or {}).get("ok") else None
    return {"house": ref["house"].get("value"), "land": ref["land"].get("value"),
            "houseSamples": ref["house"].get("sampleSize"), "address": a["address"],
            "officialYear": int(hp["stdrYear"]) if hp and hp.get("stdrYear") else None, "officialValue": (hp or {}).get("housePc")}


def _snapshot(c, watch_id: str, analysis_id: str, v: dict, base: bool = False):
    c.execute("INSERT INTO price_snapshots (watch_id, analysis_id, house_value, land_value, house_samples, official_year, official_value, "
              "checked_at, is_base) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (watch_id, analysis_id, v["house"], v["land"], v["houseSamples"],
                                                                         v.get("officialYear"), v.get("officialValue"), now_iso(), int(base)))


def baseline(watch_id: str, analysis_id: str) -> None:
    """내 자산 저장 시 기준값(알림 없음). 이미 기록이 있으면 그대로 둔다."""
    with dbm.connect() as c:
        if c.execute("SELECT 1 FROM price_snapshots WHERE watch_id = ?", (watch_id,)).fetchone():
            return
    v = _values(analysis_id)
    if v:
        with dbm.connect() as c:
            _snapshot(c, watch_id, analysis_id, v, base=True)


def _pct(old: float | None, new: float | None) -> float | None:
    return (new / old - 1) * 100 if old and new else None


def _won(v: float) -> str:
    v = round(v / 10_000) * 10_000
    eok, man = int(v // 100_000_000), int((v % 100_000_000) // 10_000)
    return f"{eok}억 {man:,}만 원" if eok and man else f"{eok}억 원" if eok else f"{man:,}만 원"


def _refresh_lookup(analysis_id: str) -> None:
    """공공자료(실거래·공시가격)를 새로 조회해 분석이 최신 자료를 쓰게 한다."""
    with dbm.connect() as c:
        row = c.execute("SELECT lookup_id FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    old = prop.get_lookup(row["lookup_id"]) if row else None
    if not old:
        return
    new = asyncio.run(prop.lookup(old["mode"], old["address"]))
    with dbm.connect() as c:
        c.execute("UPDATE analyses SET lookup_id = ?, updated_at = ? WHERE id = ?", (new["id"], now_iso(), analysis_id))


def check_all(refresh: bool = True) -> dict:
    """모든 내 자산을 확인. 반환: {checked, alerts, failed}"""
    out = {"checked": 0, "alerts": 0, "failed": 0}
    with dbm.connect() as c:
        watches = c.execute("SELECT w.id, w.user_id, w.asset_id, w.analysis_id, a.road_addr, a.jibun_addr FROM watched_assets w "
                            "JOIN assets a ON a.id = w.asset_id WHERE w.deleted_at IS NULL AND w.analysis_id IS NOT NULL").fetchall()
    for w in watches:
        try:
            if refresh:
                _refresh_lookup(w["analysis_id"])
            v = _values(w["analysis_id"])
            if not v:
                continue
            with dbm.connect() as c:
                # 비교 기준: 마지막으로 알린 때(또는 처음 저장한 때)의 기록 — 매일 조금씩 바뀌어도 누적 변동을 잡는다
                last = c.execute("SELECT * FROM price_snapshots WHERE watch_id = ? AND is_base = 1 ORDER BY id DESC LIMIT 1",
                                 (w["id"],)).fetchone()
                alerts = _alerts(last, v) if last else []
                _snapshot(c, w["id"], w["analysis_id"], v, base=not last or bool(alerts))
                out["checked"] += 1
                if not last:
                    continue
                name = w["road_addr"] or w["jibun_addr"] or "내 자산"
                for title, body in alerts:
                    c.execute("INSERT INTO notifications (id, user_id, dedupe_key, asset_id, program_id, event, title, body, created_at) "
                              "VALUES (?, ?, ?, ?, NULL, 'price_change', ?, ?, ?)",
                              (str(uuid.uuid4()), w["user_id"], f"price:{w['id']}:{title}:{now_iso()}", w["asset_id"], title,
                               f"[{name}] {body}", now_iso()))
            for title, body in alerts:
                push.send(w["user_id"], title, f"{name} — {body}", url=f"/analyses/{w['analysis_id']}")
                out["alerts"] += 1
        except Exception as e:  # noqa: BLE001 — 한 집이 실패해도 나머지는 계속
            out["failed"] += 1
            log.warning("내 자산 가격 확인 실패(%s): %s", w["id"], type(e).__name__)
    return out


def _alerts(last, v: dict) -> list[tuple[str, str]]:
    """직전 기록(last)과 새 값(v)을 비교해 보낼 알림 목록. 기준: ±PRICE_ALERT_PCT 이상 + 비교 거래 최소 건수."""
    out = []
    samples = v.get("houseSamples") or 0
    if samples >= settings.price_alert_min_samples:
        parts = []
        for key, label in (("house", "그대로 팔 때"), ("land", "철거 후 땅")):
            p = _pct(last[f"{key}_value"], v[key])
            if p is not None and abs(p) >= settings.price_alert_pct:
                parts.append(f"{label} {_won(last[f'{key}_value'])} → {_won(v[key])} ({'+' if p > 0 else ''}{p:.1f}%)")
        if parts:
            up = (v["house"] or 0) >= (last["house_value"] or 0)
            out.append((f"예상 가격이 {'올랐어요' if up else '내렸어요'}", " · ".join(parts) + f" · 주변 거래 {samples}건 기준"))
    year, value = v.get("officialYear"), v.get("officialValue")
    prev_year, prev_value = last["official_year"], last["official_value"]
    if year and prev_year and year > prev_year and value and prev_value:
        p = _pct(prev_value, value)
        out.append((f"{year}년 공시가격이 발표됐어요", f"개별주택가격 {_won(prev_value)} → {_won(value)} ({'+' if p > 0 else ''}{p:.1f}%)"))
    return out


def run_once() -> dict:
    with dbm.connect() as c:
        rid = c.execute("INSERT INTO price_watch_runs (started_at) VALUES (?)", (now_iso(),)).lastrowid
    try:
        out = check_all()
        with dbm.connect() as c:
            c.execute("UPDATE price_watch_runs SET finished_at = ?, checked = ?, alerts = ? WHERE id = ?",
                      (now_iso(), out["checked"], out["alerts"], rid))
        return out
    except Exception as e:  # noqa: BLE001
        with dbm.connect() as c:
            c.execute("UPDATE price_watch_runs SET finished_at = ?, error = ? WHERE id = ?", (now_iso(), type(e).__name__, rid))
        raise


def due(at=None) -> bool:
    """매일 정해진 시각이 지났고 오늘 실행 기록이 없으면 실행(서버가 꺼져 있었으면 켜진 뒤 실행)."""
    at = (at or now()).astimezone(KST)
    if at.hour < settings.price_watch_hour:
        return False
    today = at.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    with dbm.connect() as c:
        last = c.execute("SELECT started_at FROM price_watch_runs ORDER BY id DESC LIMIT 1").fetchone()
    return not last or last["started_at"] < today


def start_scheduler():
    if not settings.price_watch_enabled:
        return

    def loop():
        while True:
            try:
                if due():
                    log.info("내 자산 예상 가격 확인: %s", run_once())
            except Exception as e:  # noqa: BLE001
                log.warning("내 자산 가격 확인 작업 실패: %s", type(e).__name__)
            time.sleep(900)
    threading.Thread(target=loop, name="price-watch", daemon=True).start()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    dbm.connect().close()
    print(run_once())
