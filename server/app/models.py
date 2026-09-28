import datetime
from typing import Any

from sqlalchemy import BigInteger, Date, DateTime, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    openid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # 展示用昵称；新建用户默认「小韭菜」，可在「我的」里改
    nickname: Mapped[str | None] = mapped_column(
        String(64), default="小韭菜", server_default="小韭菜"
    )
    avatar: Mapped[str | None] = mapped_column(String(256))
    # 月度预算；0 表示未设置，首页不提醒
    monthly_budget: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    sub_category: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), default="manual")
    # AI 解析前的原文，可追溯；手动记账可为空
    raw_text: Mapped[str | None] = mapped_column(Text)
    bill_time: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # 无具体钟点时的时段标签：早上/中午/晚上/白天；有精确时间则为空
    time_period: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MonthlyReport(Base):
    """月度 AI 复盘缓存：同一用户同一月份只存一份。"""

    __tablename__ = "monthly_reports"
    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_monthly_reports_user_month"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Feedback(Base):
    """用户意见反馈；images 存 /uploads/... 相对 URL 列表（历史行可能仍是 base64）。"""

    __tablename__ = "feedbacks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    contact: Mapped[str | None] = mapped_column(String(128))
    images: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RecurringBill(Base):
    """周期账单模板：到期日由后台任务自动生成一笔真实账单。"""

    __tablename__ = "recurring_bills"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # monthly | weekly
    recurring_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # 每月几号 1-31，或每周几 0=周一 … 6=周日
    recurring_day: Mapped[int] = mapped_column(Integer, nullable=False)
    # 东八区日历日：下次应自动扣款/入账的日期
    next_date: Mapped[datetime.date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
