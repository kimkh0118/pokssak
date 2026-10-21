"""환경변수(backend/.env)에서 설정을 읽는다. 인증키는 서버에서만 쓰고 응답·로그에 내보내지 않는다."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _env(name: str) -> str | None:
    value = (os.getenv(name) or "").strip()
    return value or None


@dataclass
class Settings:
    juso_key: str | None = _env("JUSO_API_KEY")
    data_go_kr_key: str | None = _env("DATA_GO_KR_SERVICE_KEY")
    vworld_key: str | None = _env("VWORLD_API_KEY")
    vworld_domain: str | None = _env("VWORLD_DOMAIN")
    timeout_seconds: float = float(_env("PUBLIC_API_TIMEOUT_SECONDS") or 10)
    database_path: str = _env("DATABASE_PATH") or str(BACKEND_DIR / "data" / "app.db")
    frontend_origin: str = _env("FRONTEND_ORIGIN") or "http://localhost:3000"


settings = Settings()
