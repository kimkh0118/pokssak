"""구글 로그인: state 검사, id_token 검사, 첫 로그인 가입, 관리자 동기화, 비밀번호 로그인 차단(가짜 구글 응답)."""

import base64
import json
import time

import httpx
import pytest

from app import auth, db as dbm, google_oauth
from app.settings import settings


def token(**over):
    claims = {"iss": "https://accounts.google.com", "aud": "cid", "exp": int(time.time()) + 600,
              "sub": "123", "email": "26_04@bssm.hs.kr", "email_verified": True} | over
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{enc({'alg': 'RS256'})}.{enc(claims)}.sig"


def google(id_token):
    return httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"id_token": id_token})))


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(settings, "google_client_secret", "secret")
    monkeypatch.setattr(settings, "admin_emails", ["26_04@bssm.hs.kr"])


def test_start_and_finish():
    url, cookie = google_oauth.start("/analyses/1")
    assert "accounts.google.com" in url and "state=" in url
    state = cookie.split("|")[0]
    email, sub, nxt = google_oauth.finish("code", state, cookie, google(token()))
    assert (email, sub, nxt) == ("26_04@bssm.hs.kr", "123", "/analyses/1")


def test_rejects_bad_state_and_tokens():
    _, cookie = google_oauth.start("/my")
    state = cookie.split("|")[0]
    with pytest.raises(google_oauth.GoogleError):
        google_oauth.finish("code", "wrong", cookie, google(token()))
    for bad in (token(aud="other"), token(iss="evil"), token(exp=1), token(email_verified=False)):
        with pytest.raises(google_oauth.GoogleError):
            google_oauth.finish("code", state, cookie, google(bad))


def test_next_must_stay_on_site():
    assert google_oauth.safe_next("https://evil.test") == "/my"
    assert google_oauth.safe_next("//evil.test") == "/my"
    assert google_oauth.safe_next("/notifications") == "/notifications"


def test_first_login_creates_admin_and_blocks_password_login(monkeypatch):
    tok = auth.google_login("26_04@bssm.hs.kr", "123")
    user = auth.current_user(tok)
    assert user["email"] == "26_04@bssm.hs.kr" and user["isAdmin"]
    with pytest.raises(auth.AuthError):
        auth.login("26_04@bssm.hs.kr", "google:123")  # 구글 계정은 비밀번호 로그인 불가
    monkeypatch.setattr(settings, "admin_emails", [])
    assert not auth.current_user(auth.google_login("26_04@bssm.hs.kr", "123"))["isAdmin"]  # 해제도 반영
    with dbm.connect() as c:
        assert c.execute("SELECT count(*) FROM users").fetchone()[0] == 1
