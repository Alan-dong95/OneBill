-- 已有库追加 feedbacks 表（可重复执行）
-- 用法：psql -U postgres -d onebill -f sql/migrate_feedbacks.sql

CREATE TABLE IF NOT EXISTS feedbacks (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    content     TEXT NOT NULL,
    contact     TEXT,
    images      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_time ON feedbacks(user_id, created_at DESC);
