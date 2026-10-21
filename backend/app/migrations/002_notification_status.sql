-- 알림을 만들 때의 사업 신청 상태를 기록해, '예정 → 접수중' 변화가 있을 때만 접수 시작 알림을 보낸다.
ALTER TABLE notifications ADD COLUMN program_status TEXT;
