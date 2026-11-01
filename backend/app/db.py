"""SQLite 연결과 마이그레이션. migrations/*.sql 을 버전 순서대로 한 번씩 적용한다."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .clock import now_iso
from .settings import settings

MIGRATIONS = Path(__file__).parent / "migrations"


_client = None
_remote_migrated = False


def connect() -> sqlite3.Connection:
    """TURSO_DATABASE_URL 이 있으면 Turso(배포), 없으면 로컬 SQLite 파일(개발)"""
    global _client, _remote_migrated
    if settings.turso_url:
        import httpx

        from . import turso

        if _client is None:
            _client = httpx.Client(timeout=15)
        db = turso.Connection(settings.turso_url, settings.turso_token, _client)
        if not _remote_migrated:
            migrate(db)
            _remote_migrated = True
        return db  # type: ignore[return-value]
    if settings.database_path != ":memory:":
        Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(settings.database_path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    migrate(db)
    return db


def migrate(db: sqlite3.Connection):
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
    done = {r[0] for r in db.execute("SELECT version FROM schema_migrations")}
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.stem in done:
            continue
        sql = f.read_text(encoding="utf-8").replace("CREATE TABLE schema_migrations", "CREATE TABLE IF NOT EXISTS schema_migrations")
        db.executescript(sql)
        db.execute("INSERT INTO schema_migrations VALUES (?, ?)", (f.stem, now_iso()))
        db.commit()


def dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def loads(s: str | None):
    return json.loads(s) if s else None
