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
    # 해외 서버(Render)에서는 브이월드가 막혀서 서울 리전 Vercel 중계를 거친다. 예: https://<vercel 주소>/relay/vworld
    vworld_relay_url: str | None = _env("VWORLD_RELAY_URL")
    vworld_relay_secret: str | None = _env("VWORLD_RELAY_SECRET")
    timeout_seconds: float = float(_env("PUBLIC_API_TIMEOUT_SECONDS") or 10)
    # 저장
    database_path: str = _env("DATABASE_PATH") or str(BACKEND_DIR / "data" / "app.db")
    # 배포: Turso(원격 SQLite). 있으면 위 파일 대신 이것을 쓴다
    turso_url: str | None = _env("TURSO_DATABASE_URL")
    turso_token: str | None = _env("TURSO_AUTH_TOKEN")
    frontend_origin: str = _env("FRONTEND_ORIGIN") or "http://localhost:3000"
    # 관리자: 이 이메일로 가입하면 관리자 권한
    admin_emails: list[str] = field(default_factory=lambda: [e.strip().lower() for e in (_env("ADMIN_EMAILS") or "").split(",") if e.strip()])
    # 구글 로그인(OAuth). Google Cloud 콘솔에서 발급. 리디렉션 URI 는 {FRONTEND_ORIGIN}/api/auth/google/callback
    google_client_id: str | None = _env("GOOGLE_CLIENT_ID")
    google_client_secret: str | None = _env("GOOGLE_CLIENT_SECRET")
    # 내 자산 예상 가격 변동 알림: 기준 비율(%)과 매주 확인 요일(0=월)·시각(한국 시간)
    # 예상 가격이 이 비율(%) 이상 바뀌고, 비교 거래가 최소 건수 이상일 때만 알림. 매일 이 시각(한국 시간) 이후 하루 1번 확인
    price_alert_pct: float = float(_env("PRICE_ALERT_PCT") or 3.0)
    price_alert_min_samples: int = int(_env("PRICE_ALERT_MIN_SAMPLES") or 3)
    price_watch_hour: int = int(_env("PRICE_WATCH_HOUR") or 9)
    # 웹 푸시(VAPID)
    vapid_public_key: str | None = _env("VAPID_PUBLIC_KEY")
    vapid_private_key: str | None = _env("VAPID_PRIVATE_KEY")
    vapid_subject: str = _env("VAPID_SUBJECT") or "mailto:admin@example.com"
    price_watch_enabled: bool = (_env("PRICE_WATCH_ENABLED") or "1") == "1"
    # 카카오 로컬 API(중개사무소 전화번호·위치). developers.kakao.com 앱에서 '카카오맵' 서비스를 켜야 함
    kakao_rest_api_key: str | None = _env("KAKAO_REST_API_KEY")
    # AI 설명(선택). 키가 없으면 규칙 기반 설명
    anthropic_api_key: str | None = _env("ANTHROPIC_API_KEY")
    llm_model: str = _env("LLM_MODEL") or "claude-sonnet-5-5"
    # 로그인 + 필수 동의를 마친 회원만 자료 조회·분석 가능(테스트에서만 끔)
    require_member: bool = (_env("REQUIRE_MEMBER") or "1") == "1"
    # 예시(가상) 주소: 화면에서는 제거됨. 개발·테스트에서만 SAMPLE_MODE=1로 켬
    sample_mode: bool = (_env("SAMPLE_MODE") or "0") == "1"


settings = Settings()
