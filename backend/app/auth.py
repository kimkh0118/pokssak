"""회원·세션. 비밀번호는 PBKDF2 해시, 세션 토큰은 해시만 저장(httpOnly 쿠키로 전달)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from . import db as dbm
from .clock import now, now_iso
from .settings import settings

SESSION_COOKIE = "hc_session"
GUEST_COOKIE = "hc_guest"
SESSION_DAYS = 30


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def _check_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    return hmac.compare_digest(_hash_password(password, bytes.fromhex(salt)).split("$")[2], digest)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthError(Exception):
    pass


def signup(email: str, password: str) -> dict:
    email = email.strip().lower()
    if "@" not in email or len(password) < 8:
        raise AuthError("이메일 형식과 8자 이상 비밀번호가 필요합니다.")
    with dbm.connect() as c:
        if c.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise AuthError("이미 가입된 이메일입니다.")
        uid = str(uuid.uuid4())
        c.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                  (uid, email, _hash_password(password), int(email in settings.admin_emails), now_iso()))
        c.execute("INSERT INTO notification_settings (user_id, updated_at) VALUES (?, ?)", (uid, now_iso()))
    return {"id": uid, "email": email}


def _new_session(c, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    c.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)",
              (token_hash(token), user_id, now_iso(), (now() + timedelta(days=SESSION_DAYS)).isoformat()))
    return token


def _sync_admin(c, user_id: str, email: str):
    """ADMIN_EMAILS 를 바꾸면 다음 로그인 때 바로 반영(추가·해제 모두)."""
    c.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(email in settings.admin_emails), user_id))


def google_login(email: str, subject: str) -> str:
    """구글 계정(확인된 이메일)으로 로그인. 처음이면 가입. 같은 이메일의 기존 계정이 있으면 그 계정으로."""
    email = email.strip().lower()
    with dbm.connect() as c:
        row = c.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            uid = row["id"]
        else:
            uid = str(uuid.uuid4())
            # 비밀번호 로그인은 막고 구글 로그인만(해시 형식이 아니라 비밀번호가 맞을 수 없음)
            c.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?)", (uid, email, f"google:{subject}", 0, now_iso()))
            c.execute("INSERT INTO notification_settings (user_id, updated_at) VALUES (?, ?)", (uid, now_iso()))
        _sync_admin(c, uid, email)
        return _new_session(c, uid)


def login(email: str, password: str) -> str:
    with dbm.connect() as c:
        row = c.execute("SELECT id, password_hash FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
        if not row or row["password_hash"].startswith("google:") or not _check_password(password, row["password_hash"]):
            raise AuthError("이메일 또는 비밀번호가 맞지 않습니다.")
        _sync_admin(c, row["id"], email.strip().lower())
        return _new_session(c, row["id"])


def logout(token: str | None):
    if token:
        with dbm.connect() as c:
            c.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))


def current_user(token: str | None) -> dict | None:
    if not token:
        return None
    with dbm.connect() as c:
        row = c.execute("SELECT u.id, u.email, u.is_admin, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id "
                        "WHERE s.token_hash = ?", (token_hash(token),)).fetchone()
    if not row or row["expires_at"] < now_iso():
        return None
    return {"id": row["id"], "email": row["email"], "isAdmin": bool(row["is_admin"])}


def delete_account(user_id: str):
    """회원 탈퇴: 이 회원의 기록을 모두 지운다(동의 철회 포함). 원격 DB는 외래키 연쇄 삭제를 보장하지 않아 순서대로 직접 지운다."""
    mine = "SELECT id FROM analyses WHERE owner_user_id = ?"
    with dbm.connect() as c:
        for sql in (
            f"DELETE FROM evidence_inputs WHERE analysis_id IN ({mine})",
            f"DELETE FROM demolition_plans WHERE analysis_id IN ({mine})",
            "DELETE FROM price_snapshots WHERE watch_id IN (SELECT id FROM watched_assets WHERE user_id = ?)",
            "DELETE FROM outbox WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ?)",
            "DELETE FROM notifications WHERE user_id = ?",
            "DELETE FROM push_subscriptions WHERE user_id = ?",
            "DELETE FROM watched_assets WHERE user_id = ?",
            "DELETE FROM analyses WHERE owner_user_id = ?",
            "DELETE FROM notification_settings WHERE user_id = ?",
            "DELETE FROM user_consents WHERE user_id = ?",
            "DELETE FROM sessions WHERE user_id = ?",
            "DELETE FROM users WHERE id = ?",
        ):
            c.execute(sql, (user_id,))
