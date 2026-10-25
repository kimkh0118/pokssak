"""구글 로그인(OAuth 2.0 / OpenID Connect, 인가 코드 방식).

1) /api/auth/google/start: state(위조 방지)를 쿠키에 넣고 구글 로그인 화면으로 보낸다.
2) /api/auth/google/callback: state 확인 → 코드로 토큰 교환(서버↔구글 TLS, 클라이언트 비밀번호 사용)
   → id_token 의 발급자·대상·만료·이메일 확인 여부를 검사한다.
"""

from __future__ import annotations

import base64
import json
import secrets
import time
from urllib.parse import urlencode

import httpx

from .settings import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
STATE_COOKIE = "hc_google_state"


class GoogleError(Exception):
    pass


def configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri() -> str:
    return f"{settings.frontend_origin}/api/auth/google/callback"


def safe_next(path: str | None) -> str:
    """로그인 후 이동할 곳은 이 사이트 안의 경로만(외부 주소로 보내는 공격 방지)."""
    return path if path and path.startswith("/") and not path.startswith("//") and "\\" not in path else "/my"


def start(next_path: str | None) -> tuple[str, str]:
    """(구글 로그인 주소, state 쿠키 값)"""
    state = secrets.token_urlsafe(24)
    url = AUTH_URL + "?" + urlencode({
        "client_id": settings.google_client_id, "redirect_uri": redirect_uri(), "response_type": "code",
        "scope": "openid email", "state": state, "prompt": "select_account",
    })
    return url, f"{state}|{safe_next(next_path)}"


def _claims(id_token: str) -> dict:
    try:
        payload = id_token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError) as e:
        raise GoogleError("구글 응답을 해석하지 못했습니다.") from e


def finish(code: str, state: str, cookie: str | None, client: httpx.Client | None = None) -> tuple[str, str, str]:
    """(이메일, 구글 계정 ID, 이동할 경로). 문제가 있으면 GoogleError."""
    if not cookie or "|" not in cookie:
        raise GoogleError("로그인 요청이 만료됐어요. 다시 시도해 주세요.")
    expected, next_path = cookie.split("|", 1)
    if not secrets.compare_digest(expected, state or ""):
        raise GoogleError("로그인 요청이 올바르지 않아요(state 불일치).")
    try:
        r = (client or httpx).post(TOKEN_URL, timeout=15, data={
            "code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri(), "grant_type": "authorization_code"})
    except httpx.HTTPError as e:
        raise GoogleError("구글에 연결하지 못했어요.") from e
    if r.status_code != 200 or "id_token" not in r.json():
        raise GoogleError("구글 로그인 확인에 실패했어요.")
    c = _claims(r.json()["id_token"])
    if c.get("iss") not in ISSUERS or c.get("aud") != settings.google_client_id or int(c.get("exp", 0)) < time.time():
        raise GoogleError("구글 로그인 정보가 올바르지 않아요.")
    if not c.get("email") or c.get("email_verified") not in (True, "true"):
        raise GoogleError("이메일이 확인된 구글 계정만 쓸 수 있어요.")
    return c["email"], str(c["sub"]), safe_next(next_path)
