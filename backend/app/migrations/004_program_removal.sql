-- 관리자 삭제(숨김). 원문·버전·검토 이력은 보존한다.
ALTER TABLE programs ADD COLUMN removed_at TEXT;
ALTER TABLE programs ADD COLUMN removed_by TEXT;
ALTER TABLE programs ADD COLUMN removed_reason TEXT;
