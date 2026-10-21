"""환경변수(backend/.env) 설정. 키·접속정보는 서버에서만 쓰고 응답·로그에 내보내지 않는다."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _env(name: str) -> str | None:
    value = (os.getenv(name) or "").strip()
    return value or None


@dataclass
class Settings:
    # 공공 API (서비스 6개, 인증키는 기관별로 다름: 주소 1 · 공공데이터포털 1(서비스 4개 공용 계정키) · 브이월드 1)
    juso_key: str | None = _env("JUSO_API_KEY")
    data_go_kr_key: str | None = _env("DATA_GO_KR_SERVICE_KEY")
    vworld_key: str | None = _env("VWORLD_API_KEY")
    vworld_domain: str | None = _env("VWORLD_DOMAIN")
    timeout_seconds: float = float(_env("PUBLIC_API_TIMEOUT_SECONDS") or 10)
    # 저장
    database_path: str = _env("DATABASE_PATH") or str(BACKEND_DIR / "data" / "app.db")
    frontend_origin: str = _env("FRONTEND_ORIGIN") or "http://localhost:3000"
    # 관리자: 이 이메일로 가입하면 관리자 권한
    admin_emails: list[str] = field(default_factory=lambda: [e.strip().lower() for e in (_env("ADMIN_EMAILS") or "").split(",") if e.strip()])
    # 지원사업 구조화(LLM). 키가 없으면 예시 추출기로 동작
    anthropic_api_key: str | None = _env("ANTHROPIC_API_KEY")
    llm_model: str = _env("LLM_MODEL") or "claude-sonnet-5-5"
    # 주간 수집 예약(한국 시간). 예: "MON 09:00"
    program_schedule: str = _env("PROGRAM_SCHEDULE") or "MON 09:00"
    scheduler_enabled: bool = (_env("SCHEDULER_ENABLED") or "1") == "1"
    # 외부 알림 공급자(없으면 앱 내 알림만)
    email_provider_url: str | None = _env("EMAIL_PROVIDER_URL")
    sms_provider_url: str | None = _env("SMS_PROVIDER_URL")
    push_provider_url: str | None = _env("PUSH_PROVIDER_URL")


settings = Settings()
