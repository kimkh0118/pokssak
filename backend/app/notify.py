"""관심자산 알림. 주간 사업 발행 후 관심자산과 조건을 비교해 변화가 있을 때만 알린다.
- 이벤트: new_candidate(새 지원 후보) | opened(접수 시작) | changed(금액·대상·조건 변경) | closed(마감·취소)
- 중복 방지 키: 사용자·자산·사업·이벤트·버전. 조회시각만 바뀌면 알리지 않는다.
- outbox 에 저장 → 전송 직전 수신 해제·자산 삭제를 다시 확인 → 전송·재시도. 실패를 성공으로 기록하지 않는다.
- 기본은 앱 내 알림함. 이메일·문자·푸시는 공급자 설정과 사용자 수신 신청이 모두 있을 때만.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta

import httpx

from . import db as dbm, programs
from .clock import now, now_iso
from .settings import settings

log = logging.getLogger("notify")
MAX_ATTEMPTS = 5
TITLES = {
    "new_candidate": "지원 후보가 있습니다",
    "opened": "지원사업 접수가 시작되었습니다",
    "changed": "지원사업 조건 확인이 필요합니다",
    "closed": "지원사업이 마감·취소되었습니다",
    "admin_alert": "[관리자] 수집 확인 필요",
}


def admin_alert(kind: str, body: str) -> int:
    """관리자 전원에게 앱 알림(같은 종류는 하루 한 번). 알림함 표시는 dispatch 후."""
    day = now_iso()[:10]
    made = 0
    with dbm.connect() as c:
        admins = c.execute("SELECT id FROM users WHERE is_admin = 1").fetchall()
        for a in admins:
            key = f"admin:{kind}:{day}:{a['id']}"
            if c.execute("SELECT 1 FROM notifications WHERE dedupe_key = ?", (key,)).fetchone():
                continue
            nid = str(uuid.uuid4())
            c.execute("INSERT INTO notifications (id, user_id, dedupe_key, asset_id, program_id, event, title, body, created_at) "
                      "VALUES (?, ?, ?, NULL, NULL, 'admin_alert', ?, ?, ?)", (nid, a["id"], key, TITLES["admin_alert"], body, now_iso()))
            c.execute("INSERT INTO outbox VALUES (?, ?, 'in_app', 'pending', 0, ?, NULL, NULL)", (str(uuid.uuid4()), nid, now_iso()))
            made += 1
    return made


def providers() -> dict:
    return {"email": settings.email_provider_url, "sms": settings.sms_provider_url, "push": settings.push_provider_url}


def _create(c, user_id, asset_id, program, event, key, body):
    if c.execute("SELECT 1 FROM notifications WHERE dedupe_key = ?", (key,)).fetchone():
        return None
    nid = str(uuid.uuid4())
    c.execute("INSERT INTO notifications (id, user_id, dedupe_key, asset_id, program_id, event, title, body, created_at, program_status) "
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              (nid, user_id, key, asset_id, program["id"], event, TITLES[event], body, now_iso(), program["status"]))
    s = c.execute("SELECT * FROM notification_settings WHERE user_id = ?", (user_id,)).fetchone()
    channels = ["in_app"] if (s is None or s["in_app"]) else []
    for ch in ("email", "sms", "push"):
        if s is not None and s[ch] and providers()[ch]:
            channels.append(ch)
    for ch in channels:
        c.execute("INSERT INTO outbox VALUES (?, ?, ?, 'pending', 0, ?, NULL, NULL)", (str(uuid.uuid4()), nid, ch, now_iso()))
    return nid


def generate(profile_for) -> int:
    """profile_for(analysis_id) → (lookup, profile). 발행본과 관심자산을 비교해 알림을 만든다."""
    made = 0
    progs = programs.published(include_sample=True)
    with dbm.connect() as c:
        watches = c.execute("SELECT w.user_id, w.asset_id, w.analysis_id FROM watched_assets w WHERE w.deleted_at IS NULL "
                            "AND w.analysis_id IS NOT NULL").fetchall()
        for w in watches:
            got = profile_for(w["analysis_id"])
            if not got:
                continue
            lk, profile = got
            for p in progs:
                if p["isSample"] and lk["mode"] != "sample":
                    continue
                m = programs.match(p, profile)
                title = (p["data"].get("title") or {}).get("value") or "지원사업"
                base = f"{w['user_id']}:{w['asset_id']}:{p['id']}"
                had = c.execute("SELECT program_status FROM notifications WHERE dedupe_key = ?", (f"{base}:new_candidate",)).fetchone()
                if m["result"] in ("partial_match", "needs_check"):
                    if not had:
                        state = "조건 일부 일치" if m["result"] == "partial_match" else "추가 확인 필요"
                        made += bool(_create(c, w["user_id"], w["asset_id"], p, "new_candidate", f"{base}:new_candidate",
                                             f"[{title}] {state} · 신청 상태 {p['status']}. 지원 확정이 아닙니다."))
                    elif p["status"] == "접수중" and had["program_status"] == "예정":  # 예정 → 접수중 변화만
                        made += bool(_create(c, w["user_id"], w["asset_id"], p, "opened", f"{base}:opened",
                                             f"[{title}] 신청 기간이 시작되었습니다. 대상 조건을 확인하세요."))
                    if p["versionNo"] > 1:
                        made += bool(_create(c, w["user_id"], w["asset_id"], p, "changed", f"{base}:changed:v{p['versionNo']}",
                                             f"[{title}] 공고 내용이 바뀌었습니다(버전 {p['versionNo']}). 조건 확인이 필요합니다."))
                elif m["result"] == "closed" and had:
                    made += bool(_create(c, w["user_id"], w["asset_id"], p, "closed", f"{base}:closed:{p['status']}",
                                         f"[{title}] {p['status']} 상태로 바뀌었습니다."))
    return made


def dispatch() -> dict:
    """대기 중인 outbox 전송. 전송 직전 수신 설정·자산 삭제를 다시 확인한다."""
    stats = {"sent": 0, "failed": 0, "skipped": 0, "retry": 0}
    with dbm.connect() as c:
        rows = c.execute("SELECT o.*, n.user_id, n.asset_id, n.title, n.body FROM outbox o JOIN notifications n ON n.id = o.notification_id "
                         "WHERE o.status = 'pending' AND o.next_attempt_at <= ?", (now_iso(),)).fetchall()
        for o in rows:
            s = c.execute("SELECT * FROM notification_settings WHERE user_id = ?", (o["user_id"],)).fetchone()
            # 관리자 알림처럼 관심자산과 무관한 알림(asset_id 없음)은 자산 확인을 하지 않는다
            watching = o["asset_id"] is None or c.execute("SELECT 1 FROM watched_assets WHERE user_id = ? AND asset_id = ? AND deleted_at IS NULL",
                                                          (o["user_id"], o["asset_id"])).fetchone()
            if not watching or (s is not None and not s[o["channel"]]):
                c.execute("UPDATE outbox SET status = 'skipped', last_error = ? WHERE id = ?",
                          ("자산 삭제 또는 수신 해제", o["id"]))
                stats["skipped"] += 1
                continue
            if o["channel"] == "in_app":
                c.execute("UPDATE outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?", (now_iso(), o["id"]))
                stats["sent"] += 1
                continue
            url = providers()[o["channel"]]
            if not url:
                c.execute("UPDATE outbox SET status = 'skipped', last_error = '발송 공급자 미설정' WHERE id = ?", (o["id"],))
                stats["skipped"] += 1
                continue
            try:
                r = httpx.post(url, json={"userId": o["user_id"], "title": o["title"], "body": o["body"]}, timeout=10)
                r.raise_for_status()
                c.execute("UPDATE outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?", (now_iso(), o["id"]))
                stats["sent"] += 1
            except Exception as e:  # noqa: BLE001
                attempts = o["attempts"] + 1
                final = attempts >= MAX_ATTEMPTS
                c.execute("UPDATE outbox SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?",
                          ("failed" if final else "pending", attempts, type(e).__name__,
                           (now() + timedelta(minutes=5 * 2 ** attempts)).isoformat(), o["id"]))
                stats["failed" if final else "retry"] += 1
    return stats


def inbox(user_id: str) -> list[dict]:
    with dbm.connect() as c:
        rows = c.execute("SELECT n.* FROM notifications n JOIN outbox o ON o.notification_id = n.id AND o.channel = 'in_app' "
                         "AND o.status = 'sent' WHERE n.user_id = ? ORDER BY n.created_at DESC", (user_id,)).fetchall()
    return [dict(r) for r in rows]
