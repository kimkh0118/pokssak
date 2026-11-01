-- 회원 동의 기록: 항목별로 어떤 버전에 언제 동의(또는 철회)했는지 남긴다
CREATE TABLE user_consents (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,          -- age14 · terms · privacy · notify
  version TEXT NOT NULL,       -- 약관·방침 개정일
  agreed INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item)
);
