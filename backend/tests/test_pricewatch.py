"""관심자산 예상 가격 변동 알림: 저장 시 기준값(알림 없음), 1% 이상 변동 시 알림, 작은 변동은 무시."""

from fastapi.testclient import TestClient

from app import db as dbm, pricewatch
from app.main import app
from tests.test_flow import ANSWERS, lookup


def _login(c, email):
    c.post("/api/auth/signup", json={"email": email, "password": "password123"})
    c.post("/api/auth/login", json={"email": email, "password": "password123"})


def test_price_change_alerts(monkeypatch):
    sent = []
    monkeypatch.setattr(pricewatch.push, "send", lambda uid, t, b, url="": sent.append((t, b)) or 1)
    with TestClient(app) as c:
        _login(c, "watch@example.com")
        lk = lookup(c)
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()["id"]
        c.post(f"/api/analyses/{aid}/save")
        assets = c.get("/api/assets").json()["assets"]
        base = assets[0]["price"]["house_value"]
        assert base  # 저장 시 기준값
        v = {"house": base, "land": assets[0]["price"]["land_value"], "houseSamples": 5, "address": {}, "officialYear": None, "officialValue": None}
        monkeypatch.setattr(pricewatch, "_values", lambda _id: dict(v))

        v["house"] = base * 1.02   # +2% → 기준 미만
        assert pricewatch.check_all(refresh=False)["alerts"] == 0
        v["house"] = base * 1.025  # 하루하루는 작아도 처음 기준 대비 누적 2.5% → 아직 미만
        assert pricewatch.check_all(refresh=False)["alerts"] == 0
        v["house"] = base * 1.035  # 누적 3.5% → 알림
        assert pricewatch.check_all(refresh=False)["alerts"] == 1 and sent[-1][0] == "예상 가격이 올랐어요"
        assert pricewatch.check_all(refresh=False)["alerts"] == 0  # 알린 값이 새 기준

        v["house"] = base * 1.10; v["houseSamples"] = 2  # 거래 2건뿐 → 출렁임으로 보고 알리지 않음
        assert pricewatch.check_all(refresh=False)["alerts"] == 0

        items = c.get("/api/notifications").json()["items"]
        assert len(items) == 1 and "+3.5%" in items[0]["body"] and "주변 거래 5건" in items[0]["body"]
        assert c.get("/api/notifications/unread").json()["count"] == 1
        c.post("/api/notifications/read")
        assert c.get("/api/notifications/unread").json()["count"] == 0


def test_official_price_alert():
    last = {"house_value": 100, "land_value": 50, "official_year": 2026, "official_value": 80_000_000}
    v = {"house": 100, "land": 50, "houseSamples": 5, "officialYear": 2027, "officialValue": 84_000_000}
    alerts = pricewatch._alerts(last, v)
    assert alerts == [("2027년 공시가격이 발표됐어요", "개별주택가격 8,000만 원 → 8,400만 원 (+5.0%)")]


def test_deleted_watch_is_not_checked(monkeypatch):
    with TestClient(app) as c:
        _login(c, "watch2@example.com")
        lk = lookup(c)
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()["id"]
        c.post(f"/api/analyses/{aid}/save")
        wid = c.get("/api/assets").json()["assets"][0]["id"]
        c.delete(f"/api/assets/{wid}")
        assert pricewatch.check_all(refresh=False)["checked"] == 0


def test_due_schedule():
    from datetime import datetime
    from app.clock import KST
    assert pricewatch.due(datetime(2026, 10, 27, 9, 30, tzinfo=KST))      # 09:30 — 오늘 아직 안 함
    assert not pricewatch.due(datetime(2026, 10, 27, 8, 0, tzinfo=KST))   # 09시 전
    with dbm.connect() as c:
        c.execute("INSERT INTO price_watch_runs (started_at) VALUES (?)", ("2026-10-27T09:00:00+09:00",))
    assert not pricewatch.due(datetime(2026, 10, 27, 15, 0, tzinfo=KST))  # 오늘 이미 실행
    assert pricewatch.due(datetime(2026, 10, 28, 9, 5, tzinfo=KST))       # 다음 날


def test_brokers_only_for_saved_assets(monkeypatch):
    from app.adapters import vworld
    async def fake_offices(sgg):
        return {"ok": True, "meta": {"source": "test"}, "data": [
            {"name": "가나부동산", "regNo": "1", "jibunAddr": f"부산광역시 예시구 {'X'} 1", "roadAddr": "", "registeredOn": ""}]}
    monkeypatch.setattr(vworld, "offices", fake_offices)
    with TestClient(app) as c:
        lk = lookup(c)
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()["id"]
        assert c.get(f"/api/analyses/{aid}/brokers").status_code == 401  # 비로그인
        _login(c, "broker@example.com")
        aid2 = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()["id"]
        r = c.get(f"/api/analyses/{aid2}/brokers")
        assert r.status_code == 200 and r.json()["total"] == 1  # 로그인 상태 조회는 자동 저장됨
        wid = c.get("/api/assets").json()["assets"][0]["id"]
        c.delete(f"/api/assets/{wid}")
        assert c.get(f"/api/analyses/{aid2}/brokers").status_code == 403  # 관심자산에서 빼면 불가


def test_push_subscribe_requires_login_and_validates():
    with TestClient(app) as c:
        sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k", "auth": "a"}}
        assert c.post("/api/push/subscribe", json=sub).status_code == 401
        _login(c, "push@example.com")
        assert c.post("/api/push/subscribe", json={"endpoint": "x"}).status_code == 400
        assert c.post("/api/push/subscribe", json=sub).json()["ok"]
        with dbm.connect() as db:
            assert db.execute("SELECT count(*) FROM push_subscriptions").fetchone()[0] == 1
        c.post("/api/push/unsubscribe", json={"endpoint": sub["endpoint"]})
        with dbm.connect() as db:
            assert db.execute("SELECT count(*) FROM push_subscriptions").fetchone()[0] == 0
