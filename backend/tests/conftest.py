from datetime import datetime

import pytest

from app import clock
from app.settings import settings


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    """테스트마다 빈 DB, 고정 시각(한국 시간 2026-10-22 10:00), 외부 키 없음."""
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    for k in ("juso_key", "data_go_kr_key", "vworld_key", "anthropic_api_key", "email_provider_url", "sms_provider_url", "push_provider_url"):
        monkeypatch.setattr(settings, k, None)
    monkeypatch.setattr(settings, "scheduler_enabled", False)
    monkeypatch.setattr(settings, "sample_mode", True)
    monkeypatch.setattr(settings, "busan_gosi_crawl", False)  # 테스트에서 실제 사이트 접속 안 함
    monkeypatch.setattr(settings, "district_crawl", False)
    monkeypatch.setattr(settings, "gov24_enabled", False)  # 테스트용 가상 자료
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])
    clock.set_now(datetime(2026, 10, 22, 10, 0, tzinfo=clock.KST))
    yield
    clock.set_now(None)
