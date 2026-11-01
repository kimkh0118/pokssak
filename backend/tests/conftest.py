import os
from datetime import datetime

import httpx

import pytest

from app import clock
from app import db as dbm
from app.settings import settings


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    """테스트마다 빈 DB, 고정 시각(한국 시간 2026-10-22 10:00), 외부 키 없음."""
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    # TEST_TURSO=1 이면 같은 테스트를 가짜 Turso 서버로 돌린다(배포 DB 경로 확인)
    if os.getenv("TEST_TURSO") == "1":
        from .fake_turso import transport

        monkeypatch.setattr(settings, "turso_url", "libsql://fake.turso.io")
        monkeypatch.setattr(settings, "turso_token", "tok")
        monkeypatch.setattr(dbm, "_client", httpx.Client(transport=transport(str(tmp_path / "remote.db"))))
        monkeypatch.setattr(dbm, "_remote_migrated", False)
    else:
        monkeypatch.setattr(settings, "turso_url", None)
    for k in ("juso_key", "data_go_kr_key", "vworld_key", "anthropic_api_key"):
        monkeypatch.setattr(settings, k, None)
    monkeypatch.setattr(settings, "sample_mode", True)
    monkeypatch.setattr(settings, "price_watch_enabled", False)
    monkeypatch.setattr(settings, "kakao_rest_api_key", None)
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    clock.set_now(datetime(2026, 10, 22, 10, 0, tzinfo=clock.KST))
    yield
    clock.set_now(None)
