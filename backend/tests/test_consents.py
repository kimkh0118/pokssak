"""로그인 + 필수 동의를 마친 회원만 자료 조회·분석을 쓸 수 있다."""

import pytest
from fastapi.testclient import TestClient

from app import consents
from app.main import app
from app.settings import settings

ALL = {"age14": True, "terms": True, "privacy": True, "notify": False}


@pytest.fixture(autouse=True)
def locked(monkeypatch):
    monkeypatch.setattr(settings, "require_member", True)


def member(c, email="a@example.com"):
    c.post("/api/auth/signup", json={"email": email, "password": "password1"})
    c.post("/api/auth/login", json={"email": email, "password": "password1"})


def test_비회원은_조회_못하고_공개_API는_됨():
    with TestClient(app) as c:
        r = c.get("/api/address", params={"mode": "sample", "q": "예시"})
        assert r.status_code == 401 and r.json()["code"] == "login_required"
        assert c.post("/api/lookup", json={}).status_code == 401
        assert c.get("/api/status").status_code == 200
        assert c.get("/api/auth/me").json() == {"user": None}
        assert c.get("/api/push/key").status_code == 200


def test_로그인해도_필수_동의_전에는_막힘():
    with TestClient(app) as c:
        member(c)
        assert c.get("/api/auth/me").json()["user"]["consented"] is False
        r = c.get("/api/address", params={"mode": "sample", "q": "예시"})
        assert r.status_code == 403 and r.json()["code"] == "consent_required"


def test_필수_하나라도_빠지면_저장_안됨():
    with TestClient(app) as c:
        member(c)
        r = c.post("/api/consents", json=ALL | {"privacy": False})
        assert r.status_code == 400 and "개인정보" in r.json()["error"]
        assert c.get("/api/consents").json()["complete"] is False


def test_동의_후에는_조회되고_선택항목은_기록만():
    with TestClient(app) as c:
        member(c)
        st = c.post("/api/consents", json=ALL).json()
        assert st["complete"] and st["agreed"]["notify"] is False
        assert c.get("/api/auth/me").json()["user"]["consented"] is True
        assert c.get("/api/address", params={"mode": "sample", "q": "예시"}).status_code == 200


def test_약관이_바뀌면_다시_동의해야함(monkeypatch):
    with TestClient(app) as c:
        member(c)
        c.post("/api/consents", json=ALL)
        monkeypatch.setattr(consents, "VERSION", "2027-01-01")
        assert c.get("/api/address", params={"mode": "sample", "q": "예시"}).status_code == 403
        c.post("/api/consents", json=ALL)
        assert c.get("/api/address", params={"mode": "sample", "q": "예시"}).status_code == 200


def test_동의는_로그인해야_저장():
    with TestClient(app) as c:
        assert c.post("/api/consents", json=ALL).status_code == 401


def test_탈퇴하면_기록이_모두_지워지고_다시_막힘():
    from app import db as dbm
    with TestClient(app) as c:
        member(c)
        c.post("/api/consents", json=ALL)
        uid = c.get("/api/auth/me").json()["user"]["id"]
        assert c.post("/api/auth/delete").json() == {"ok": True}
        assert c.get("/api/auth/me").json() == {"user": None}
        with dbm.connect() as db:
            for t, col in (("users", "id"), ("user_consents", "user_id"), ("sessions", "user_id")):
                assert db.execute(f"SELECT COUNT(*) FROM {t} WHERE {col} = ?", (uid,)).fetchone()[0] == 0
        assert c.get("/api/address", params={"mode": "sample", "q": "예시"}).status_code == 401
