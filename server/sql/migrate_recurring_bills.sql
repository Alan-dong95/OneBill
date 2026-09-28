-- 已有库追加 recurring_bills 表（可重复执行）
-- 用法：psql -U postgres -d onebill -f sql/migrate_recurring_bills.sql

CREATE TABLE IF NOT EXISTS recurring_bills (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    category        TEXT NOT NULL,
    description     TEXT,
    -- monthly | weekly
    recurring_type  TEXT NOT NULL,
    -- 每月几号 1-31，或每周几 0=周一 … 6=周日
    recurring_day   INTEGER NOT NULL,
    -- 东八区日历日：下次自动入账日
    next_date       DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_user
    ON recurring_bills(user_id, next_date ASC);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_next_date
    ON recurring_bills(next_date);
