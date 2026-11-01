-- 문의 제목, 알림을 누르면 갈 화면 주소(예: 해당 문의)
ALTER TABLE inquiries ADD COLUMN title TEXT;
ALTER TABLE notifications ADD COLUMN link TEXT;
