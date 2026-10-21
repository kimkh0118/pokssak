"""로컬 SQLite 저장소: 조회 결과, 분석 결과, 상담 신청. 큰 값은 JSON 문자열로 저장한다."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .settings import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS lookups (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY, lookup_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  answers TEXT NOT NULL, overrides TEXT NOT NULL, target TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, option_id TEXT NOT NULL, partner_id TEXT NOT NULL,
  partner_type TEXT NOT NULL, status TEXT NOT NULL, shared_fields TEXT NOT NULL,
  contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, address_shared TEXT, message TEXT,
  created_at TEXT NOT NULL);
"""


def connect() -> sqlite3.Connection:
    if settings.database_path != ":memory:":
        Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(settings.database_path)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def save_lookup(lookup: dict):
    with connect() as db:
        db.execute("INSERT INTO lookups VALUES (?, ?, ?, ?)",
                   (lookup["id"], lookup["mode"], lookup["createdAt"], json.dumps(lookup, ensure_ascii=False)))


def get_lookup(lookup_id: str) -> dict | None:
    with connect() as db:
        row = db.execute("SELECT payload FROM lookups WHERE id = ?", (lookup_id,)).fetchone()
    return json.loads(row["payload"]) if row else None


def save_analysis(a: dict):
    """분석은 입력(답·수정값·대상)만 저장하고 결과는 열 때마다 같은 함수로 다시 계산한다."""
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO analyses VALUES (?, ?, ?, ?, ?, ?, ?)",
            (a["id"], a["lookupId"], a["createdAt"], a["updatedAt"],
             json.dumps(a["answers"], ensure_ascii=False), json.dumps(a["overrides"], ensure_ascii=False),
             json.dumps(a["target"], ensure_ascii=False)),
        )


def get_analysis(analysis_id: str) -> dict | None:
    with connect() as db:
        row = db.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if not row:
        return None
    return {"id": row["id"], "lookupId": row["lookup_id"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
            "answers": json.loads(row["answers"]), "overrides": json.loads(row["overrides"]), "target": json.loads(row["target"])}


def save_consultation(c: dict):
    with connect() as db:
        db.execute(
            "INSERT INTO consultations VALUES (?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?)",
            (c["id"], c["analysisId"], c["optionId"], c["partnerId"], c["partnerType"],
             json.dumps(c["sharedFields"]), c["contactName"], c["contactPhone"], c["addressShared"],
             c["message"], c["createdAt"]),
        )


def list_consultations(analysis_id: str) -> list[dict]:
    """연락처 등 개인정보는 목록에 포함하지 않는다."""
    with connect() as db:
        rows = db.execute("SELECT id, option_id, partner_type, status, shared_fields, created_at FROM consultations "
                          "WHERE analysis_id = ? ORDER BY created_at DESC", (analysis_id,)).fetchall()
    return [{"id": r["id"], "optionId": r["option_id"], "partnerType": r["partner_type"], "status": r["status"],
             "sharedFields": json.loads(r["shared_fields"]), "createdAt": r["created_at"]} for r in rows]
