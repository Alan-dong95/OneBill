-- 已有库追加 users.monthly_budget（可重复执行）
-- 用法：psql -U postgres -d onebill -f sql/migrate_monthly_budget.sql

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 0;
