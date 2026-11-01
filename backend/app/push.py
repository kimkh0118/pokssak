"""웹 푸시(VAPID). 사용자 기기(브라우저·홈 화면 앱)에 알림을 보낸다. 만료된 구독(404·410)은 지운다."""

from __future__ import annotations

import json
import logging

from . import db as dbm
from .clock import now_iso
from .settings import settings

log = logging.getLogger("push")


def configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def subscribe(user_id: str, sub: dict, user_agent: str | None) -> None:
    keys = sub.get("keys") or {}
    if not sub.get("endpoint") or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("구독 정보가 올바르지 않아요.")
    with dbm.connect() as c:
        c.execute("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?) "
                  "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth",
                  (user_id, sub["endpoint"], keys["p256dh"], keys["auth"], (user_agent or "")[:200], now_iso()))


def unsubscribe(user_id: str, endpoint: str) -> None:
    with dbm.connect() as c:
        c.execute("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", (user_id, endpoint))


def send(user_id: str, title: str, body: str, url: str = "/notifications") -> int:
    """사용자의 모든 기기로 보낸다. 반환: 보낸 기기 수."""
    if not configured():
        return 0
    from pywebpush import WebPushException, webpush
    with dbm.connect() as c:
        subs = c.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (user_id,)).fetchall()
    sent = 0
    for s in subs:
        try:
            webpush({"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                    json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False),
                    vapid_private_key=settings.vapid_private_key, vapid_claims={"sub": settings.vapid_subject}, timeout=10)
            sent += 1
            with dbm.connect() as c:
                c.execute("UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?", (now_iso(), s["id"]))
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):  # 기기에서 알림을 끄거나 앱을 지움
                with dbm.connect() as c:
                    c.execute("DELETE FROM push_subscriptions WHERE id = ?", (s["id"],))
            else:
                log.warning("푸시 실패(%s): %s", status, type(e).__name__)
        except Exception as e:  # noqa: BLE001
            log.warning("푸시 실패: %s", type(e).__name__)
    return sent
