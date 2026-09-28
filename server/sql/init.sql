-- 韭菜保护本 · 初始化建表 SQL（PostgreSQL 16 + pgvector）
-- 用法：psql -U postgres -d onebill -f sql/init.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id             BIGSERIAL PRIMARY KEY,
    openid         TEXT NOT NULL UNIQUE,
    nickname       TEXT,
    avatar         TEXT,
    -- 0 = 未设预算，首页不提醒
    monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    category     TEXT NOT NULL,
    sub_category TEXT,
    description  TEXT,
    source       TEXT NOT NULL DEFAULT 'manual',
    raw_text     TEXT,
    bill_time    TIMESTAMPTZ NOT NULL,
    -- 无具体钟点时的时段：早上/中午/晚上/白天
    time_period  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bills_user_time ON bills(user_id, bill_time DESC);
CREATE INDEX IF NOT EXISTS idx_bills_user_cat  ON bills(user_id, category, bill_time DESC);

-- 账单向量（第 4 阶段 RAG 用，现在建好先空着）
CREATE TABLE IF NOT EXISTS bill_vectors (
    bill_id     BIGINT PRIMARY KEY,
    embedding   vector(1024) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bill_vectors_hnsw ON bill_vectors
    USING hnsw (embedding vector_cosine_ops);

-- 月报缓存
CREATE TABLE IF NOT EXISTS monthly_reports (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    month       TEXT NOT NULL,
    content     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, month)
);

-- 意见反馈（截图以 base64 列表存 images）
CREATE TABLE IF NOT EXISTS feedbacks (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    content     TEXT NOT NULL,
    contact     TEXT,
    images      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_time ON feedbacks(user_id, created_at DESC);

-- 周期账单模板（到期由后台任务自动生成真实账单）
CREATE TABLE IF NOT EXISTS recurring_bills (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    category        TEXT NOT NULL,
    description     TEXT,
    recurring_type  TEXT NOT NULL,
    recurring_day   INTEGER NOT NULL,
    next_date       DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_user
    ON recurring_bills(user_id, next_date ASC);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_next_date
    ON recurring_bills(next_date);

