-- 문의하기: 회원이 남기고 관리자가 답한다
CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,          -- 남길 때의 이메일(관리자 화면 표시용)
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reply TEXT,
  replied_at TEXT,
  replied_by TEXT
);
CREATE INDEX inquiries_user ON inquiries(user_id, created_at);
