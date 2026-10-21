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


def login(email: str, password: str) -> str:
    with dbm.connect() as c:
        row = c.execute("SELECT id, password_hash FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
        if not row or not _check_password(password, row["password_hash"]):
            raise AuthError("이메일 또는 비밀번호가 맞지 않습니다.")
        token = secrets.token_urlsafe(32)
        c.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)",
                  (token_hash(token), row["id"], now_iso(), (now() + timedelta(days=SESSION_DAYS)).isoformat()))
    return token


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
