-- 내 자산 예상 가격(중개사 방식 추정) 기록. 변동이 기준 이상이면 notifications 에 알림을 남긴다.
CREATE TABLE price_snapshots (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 watch_id TEXT NOT NULL REFERENCES watched_assets(id) ON DELETE CASCADE,
 analysis_id TEXT,
 house_value REAL,
 land_value REAL,
 house_samples INTEGER,
 checked_at TEXT NOT NULL
);
CREATE INDEX price_snapshots_watch ON price_snapshots(watch_id, id);
CREATE TABLE price_watch_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 started_at TEXT NOT NULL,
 finished_at TEXT,
 checked INTEGER,
 alerts INTEGER,
 error TEXT
);
