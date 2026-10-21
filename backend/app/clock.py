"""시각. 마감 판정 등은 한국 시간 기준이며, 테스트에서 현재 시각을 주입할 수 있다."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9), "KST")
_fixed: datetime | None = None


def now() -> datetime:
    """현재 한국 시간. set_now() 로 고정할 수 있다."""
    return _fixed or datetime.now(KST)


def set_now(value: datetime | None):
    """테스트용 시각 주입. None 이면 실제 시각으로 돌아간다."""
    global _fixed
    _fixed = value.astimezone(KST) if value else None


def now_iso() -> str:
    return now().isoformat()


def today_kst():
    return now().date()
