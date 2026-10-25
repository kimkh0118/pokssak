"""예약 작업: 주간 지원사업 수집·매칭·알림. 기본 한국 시간 월요일 오전 9시(PROGRAM_SCHEDULE 로 변경).
작업 잠금으로 중복 실행을 막고, 실행 기록·재시도·실패 기록·수동 재실행을 제공한다.

수동 실행:  backend/.venv/bin/python -m app.jobs weekly      (작업 디렉터리: backend)
예시 자료:  backend/.venv/bin/python -m app.jobs seed-sample
"""

from __future__ import annotations

import logging
import socket
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta

import httpx

from . import analyses, db as dbm, notify, programs
from .adapters import busan_gosi, gov24, discovery
from .clock import KST, now, now_iso
from .settings import settings

log = logging.getLogger("jobs")
DAYS = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3, "FRI": 4, "SAT": 5, "SUN": 6}
LOCK_MINUTES = 900  # 17곳 × 최대 45분 심층 탐색까지
RETRY_DELAYS = (5, 30)
HOLDER = f"{socket.gethostname()}:{uuid.uuid4().hex[:6]}"


def next_run(schedule: str, after: datetime) -> datetime:
    """'MON 09:00' → after 이후 가장 가까운 한국 시간 실행 시각."""
    day, hm = schedule.split()
    h, m = map(int, hm.split(":"))
    after = after.astimezone(KST)
    cand = after.replace(hour=h, minute=m, second=0, microsecond=0) + timedelta(days=(DAYS[day.upper()] - after.weekday()) % 7)
    return cand if cand > after else cand + timedelta(days=7)


def acquire(name: str) -> bool:
    with dbm.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT holder, expires_at FROM job_locks WHERE name = ?", (name,)).fetchone()
        if row and row["expires_at"] > now_iso():
            c.execute("ROLLBACK")
            return False
        c.execute("INSERT OR REPLACE INTO job_locks VALUES (?, ?, ?)", (name, HOLDER, (now() + timedelta(minutes=LOCK_MINUTES)).isoformat()))
        c.execute("COMMIT")
    return True


def release(name: str):
    with dbm.connect() as c:
        c.execute("DELETE FROM job_locks WHERE name = ? AND holder = ?", (name, HOLDER))


def run(name: str, trigger: str, fn, retry_delays=RETRY_DELAYS) -> dict:
    run_id = str(uuid.uuid4())
    with dbm.connect() as c:
        if not acquire(name):
            c.execute("INSERT INTO job_runs VALUES (?, ?, ?, 'skipped_locked', ?, ?, 0, ?, NULL)",
                      (run_id, name, trigger, now_iso(), now_iso(), "다른 실행이 진행 중이라 건너뜀"))
            return {"id": run_id, "status": "skipped_locked"}
        c.execute("INSERT INTO job_runs VALUES (?, ?, ?, 'running', ?, NULL, 1, NULL, NULL)", (run_id, name, trigger, now_iso()))
    attempts, error, summary = 0, None, None
    try:
        for delay in (0, *retry_delays):
            if delay:
                time.sleep(delay)
            attempts += 1
            try:
                summary = fn()
                error = None
                break
            except Exception as e:  # noqa: BLE001
                error = f"{type(e).__name__}: {e}"
                log.warning("작업 %s 실패(%d회): %s", name, attempts, error)
    finally:
        release(name)
    status = "failed" if error else "succeeded"
    with dbm.connect() as c:
        c.execute("UPDATE job_runs SET status = ?, finished_at = ?, attempts = ?, summary = ?, error = ? WHERE id = ?",
                  (status, now_iso(), attempts, dbm.dumps(summary), error, run_id))
    return {"id": run_id, "status": status, "summary": summary, "error": error}


def collect(backfill: bool = False) -> dict:
    """허용된 공식 출처만 자동 수집. 실패해도 마지막 정상 자료는 유지(사업 종료로 처리하지 않음)."""
    out = {"fetched": 0, "unchanged": 0, "skipped": [], "failed": []}
    with dbm.connect() as c:
        sources = c.execute("SELECT * FROM program_sources WHERE enabled = 1").fetchall()
    for s in sources:
        if not s["auto_fetch_allowed"]:
            out["skipped"].append(f"{s['agency']}: 자동 수집 조건 미확인(링크 안내·수동 등록)")
            continue
        if not programs.robots_allows(s["list_url"]):
            out["skipped"].append(f"{s['agency']}: robots.txt 에서 허용되지 않거나 확인 불가")
            continue
        try:
            r = httpx.get(s["list_url"], timeout=20, headers={"User-Agent": "BusanVacantHouseBot/1.0"})
            r.raise_for_status()
            res = programs.ingest(s["list_url"], s["list_url"], r.content, r.headers.get("content-type"), source_id=s["id"])
            out["unchanged" if res.get("unchanged") else "fetched"] += 1
        except Exception as e:  # noqa: BLE001
            out["failed"].append(f"{s['agency']}: {type(e).__name__}")
    collect_builtin(out)
    if settings.district_crawl:
        out["sources"] = []
        for agency, url in discovery.SOURCES:
            report = discovery.crawl_source(agency, url, programs.extract_text, programs.robots_guard(), programs.ingest, backfill=backfill)
            out["sources"].append(report)
            out["fetched"] += report["fetched"]
            out["unchanged"] += report["unchanged"]
            save_report(agency, url, report)
    return out


def _ingest_text(out: dict, key: str, url: str, text: str, posted_at: str | None):
    res = programs.ingest(key, url, text.encode(), "text/plain", posted_at=posted_at)
    out["unchanged" if res.get("unchanged") else "fetched"] += 1


def collect_builtin(out: dict, gov_client=None, busan_client=None, sleep=time.sleep) -> dict:
    """정부24 공공서비스 API + 부산시 고시공고 게시판. 한쪽이 실패해도 다른 쪽은 계속한다."""
    if settings.gov24_enabled:
        try:
            for item in gov24.fetch(gov_client):
                _ingest_text(out, *gov24.to_notice(item))
        except gov24.Gov24Error as e:
            out["skipped"].append(f"정부24: {e}")
        except Exception as e:  # noqa: BLE001
            out["failed"].append(f"정부24: {type(e).__name__}")
    if settings.busan_gosi_crawl:
        if not programs.robots_allows(busan_gosi.LIST, busan_client):
            out["skipped"].append("부산시 고시공고: robots.txt 에서 허용되지 않거나 확인 불가")
        else:
            try:
                report = {}
                for n in busan_gosi.crawl(programs.extract_text, busan_client, sleep=sleep, report=report):
                    _ingest_text(out, n["noticeKey"], n["url"], n["text"], n["postedAt"])
                save_report("부산시 고시공고", busan_gosi.LIST, report)
                out["busanGosi"] = report
            except Exception as e:  # noqa: BLE001
                out["failed"].append(f"부산시 고시공고: {type(e).__name__}")
    return out


def weekly(backfill: bool = False) -> dict:
    return {"collect": collect(backfill=backfill), "notifications": notify.generate(analyses.profile_for), "dispatch": notify.dispatch()}


def runs(limit: int = 30) -> list[dict]:
    with dbm.connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM job_runs ORDER BY started_at DESC LIMIT ?", (limit,))]


# ---------------------------------------------------------------- 예약 실행(앱 안 백그라운드)
_started = False


def start_scheduler():
    global _started
    if _started or not settings.scheduler_enabled:
        return
    _started = True

    def loop():
        while True:
            due = next_run(settings.program_schedule, now())
            while now() < due:
                time.sleep(min(60, max(1, (due - now()).total_seconds())))
            run("weekly_programs", "schedule", weekly)

    threading.Thread(target=loop, name="weekly-programs", daemon=True).start()
    log.info("주간 지원사업 작업 예약: %s (한국 시간)", settings.program_schedule)




def save_report(agency: str, url: str, report: dict):
    with dbm.connect() as c:
        c.execute("INSERT INTO collection_reports(agency,source_url,report,created_at) VALUES (?,?,?,?)", (agency,url,dbm.dumps(report),now_iso()))


def coverage() -> dict:
    with dbm.connect() as c:
        counts = {
            "collected": c.execute("SELECT count(*) FROM programs WHERE is_sample=0").fetchone()[0],
            "published": c.execute("SELECT count(*) FROM programs WHERE is_sample=0 AND current_version_id IS NOT NULL").fetchone()[0],
            "pending": c.execute("SELECT count(*) FROM program_candidates k JOIN programs p ON p.id=k.program_id WHERE p.is_sample=0 AND k.status='pending'").fetchone()[0],
            "extractFailed": c.execute("SELECT count(*) FROM program_documents WHERE is_sample=0 AND extract_status!='ok'").fetchone()[0],
        }
        reports = c.execute("SELECT * FROM collection_reports WHERE id IN (SELECT max(id) FROM collection_reports GROUP BY source_url) ORDER BY agency").fetchall()
    return {"counts": counts, "reports": [{"agency": r["agency"], "url":r["source_url"], "at":r["created_at"], "detail":dbm.loads(r["report"])} for r in reports],
            "configuredSources": [{"agency":n,"url":u} for n,u in discovery.SOURCES],
            "districtEnabled":settings.district_crawl}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "weekly"
    if cmd == "seed-sample":
        from .seed import seed_sample
        print(seed_sample())
    else:
        print(run("weekly_programs", "manual", lambda: weekly(backfill=cmd == "backfill")))
