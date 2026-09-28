"""initial schema（对齐 sql/init.sql + models）

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("openid", sa.String(64), nullable=False, unique=True),
        sa.Column("nickname", sa.String(64), server_default="小韭菜"),
        sa.Column("avatar", sa.String(256)),
        sa.Column(
            "monthly_budget",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "bills",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("sub_category", sa.String(32)),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String(16), server_default="manual"),
        sa.Column("raw_text", sa.Text()),
        sa.Column("bill_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_period", sa.String(8)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_bills_user_id", "bills", ["user_id"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_bills_user_time ON bills(user_id, bill_time DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_bills_user_cat ON bills(user_id, category, bill_time DESC)"
    )

    # pgvector 不在 ORM 模型里，用裸 SQL 建表（与 init.sql 一致）
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS bill_vectors (
            bill_id     BIGINT PRIMARY KEY,
            embedding   vector(1024) NOT NULL,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bill_vectors_hnsw ON bill_vectors
            USING hnsw (embedding vector_cosine_ops)
        """
    )

    op.create_table(
        "monthly_reports",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("user_id", "month", name="uq_monthly_reports_user_month"),
    )
    op.create_index("ix_monthly_reports_user_id", "monthly_reports", ["user_id"])

    op.create_table(
        "feedbacks",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("contact", sa.String(128)),
        sa.Column(
            "images",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feedbacks_user_time ON feedbacks(user_id, created_at DESC)"
    )

    op.create_table(
        "recurring_bills",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("recurring_type", sa.String(16), nullable=False),
        sa.Column("recurring_day", sa.Integer(), nullable=False),
        sa.Column("next_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_recurring_bills_user_id", "recurring_bills", ["user_id"])
    op.create_index("ix_recurring_bills_next_date", "recurring_bills", ["next_date"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_recurring_bills_user ON recurring_bills(user_id, next_date ASC)"
    )


def downgrade() -> None:
    op.drop_table("recurring_bills")
    op.drop_table("feedbacks")
    op.drop_table("monthly_reports")
    op.execute("DROP TABLE IF EXISTS bill_vectors")
    op.drop_table("bills")
    op.drop_table("users")
