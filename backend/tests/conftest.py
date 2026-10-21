import pytest

from app.settings import settings


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """테스트마다 빈 DB. 인증키는 기본적으로 '없음'으로 둔다(실제 API를 부르지 않음)."""
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "juso_key", None)
    monkeypatch.setattr(settings, "data_go_kr_key", None)
    monkeypatch.setattr(settings, "vworld_key", None)
