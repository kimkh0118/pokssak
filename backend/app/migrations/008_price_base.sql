-- 알림 비교 기준: 처음 저장했을 때와 마지막으로 알린 때의 기록. 매일 조금씩 바뀌어도 누적 변동을 놓치지 않게.
ALTER TABLE price_snapshots ADD COLUMN is_base INTEGER NOT NULL DEFAULT 0;
UPDATE price_snapshots SET is_base = 1 WHERE id IN (SELECT min(id) FROM price_snapshots GROUP BY watch_id);
