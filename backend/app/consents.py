"""회원 동의. 필수(만 14세 이상·이용약관·개인정보 수집·이용)를 모두 동의해야 서비스를 쓸 수 있다.

약관·방침을 고치면 VERSION 을 올린다 → 기존 회원도 다음 접속 때 다시 동의 화면을 거친다.
"""

from __future__ import annotations

from . import db as dbm
from .clock import now_iso

VERSION = "2026-11-01"
ITEMS = [
    {"key": "age14", "label": "만 14세 이상이에요", "required": True, "doc": None},
    {"key": "terms", "label": "서비스 이용약관 동의", "required": True, "doc": "/terms"},
    {"key": "privacy", "label": "개인정보 수집·이용 동의", "required": True, "doc": "/privacy"},
    {"key": "notify", "label": "내 자산 가격 변동 알림 받기", "required": False, "doc": None},
]
REQUIRED = [i["key"] for i in ITEMS if i["required"]]


def status(user_id: str) -> dict:
    with dbm.connect() as c:
        rows = {r["item"]: r for r in c.execute("SELECT item, version, agreed FROM user_consents WHERE user_id = ?", (user_id,))}
    agreed = {k: bool(r["agreed"]) and r["version"] == VERSION for k, r in rows.items()}
    return {"version": VERSION, "items": ITEMS, "agreed": agreed, "complete": all(agreed.get(k) for k in REQUIRED)}


def complete(user_id: str) -> bool:
    return status(user_id)["complete"]


class ConsentError(Exception):
    pass


def save(user_id: str, choices: dict[str, bool]) -> dict:
    missing = [i["label"] for i in ITEMS if i["required"] and not choices.get(i["key"])]
    if missing:
        raise ConsentError("필수 항목에 동의해 주세요: " + ", ".join(missing))
    with dbm.connect() as c:
        for i in ITEMS:
            c.execute("INSERT INTO user_consents (user_id, item, version, agreed, updated_at) VALUES (?, ?, ?, ?, ?) "
                      "ON CONFLICT(user_id, item) DO UPDATE SET version = excluded.version, agreed = excluded.agreed, "
                      "updated_at = excluded.updated_at", (user_id, i["key"], VERSION, int(bool(choices.get(i["key"]))), now_iso()))
    return status(user_id)
