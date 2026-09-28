"""月度复盘。"""

import datetime

from pydantic import BaseModel, Field


class MonthlyReportRequest(BaseModel):
    """月度复盘入参。"""

    month: str | None = Field(None, max_length=7)  # YYYY-MM，默认当月
    force: bool = False  # True 时删缓存重新调 LLM


class CategoryStat(BaseModel):
    category: str
    amount: float
    count: int
    percent: float


class TopExpense(BaseModel):
    id: int
    amount: float
    category: str
    description: str | None
    bill_time: datetime.datetime


class MonthlyStats(BaseModel):
    total_amount: float
    bill_count: int
    avg_per_day: float
    by_category: list[CategoryStat]
    top_expense: TopExpense | None = None
    top_category_by_count: str | None = None  # 笔数最多的分类


class MonthlyReportResponse(BaseModel):
    month: str
    stats: MonthlyStats
    summary: str
    cached: bool = False  # 是否来自缓存
