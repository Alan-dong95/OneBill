-- 已有库追加 time_period（可重复执行）
-- 用法：psql -U postgres -d onebill -f sql/migrate_time_period.sql

ALTER TABLE bills ADD COLUMN IF NOT EXISTS time_period TEXT;
