-- 웹 푸시 구독(브라우저·휴대폰 홈 화면 앱). 사용자별 여러 기기.
CREATE TABLE push_subscriptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 user_agent TEXT,
 created_at TEXT NOT NULL,
 last_ok_at TEXT
);
-- 공시가격 발표 알림을 위해 기록 시점의 공시가격 연도·값도 남긴다
ALTER TABLE price_snapshots ADD COLUMN official_year INTEGER;
ALTER TABLE price_snapshots ADD COLUMN official_value REAL;
