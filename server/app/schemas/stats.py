"""独立统计页。"""

from pydantic import BaseModel


class StatsOverviewRequest(BaseModel):
    """统计总览入参：不传 month 则默认当月；mode 控制月度/年度。"""

    month: str | None = None  # YYYY-MM（年度模式用其年份）
    mode: str = "month"  # month | year


class StatsCategoryItem(BaseModel):
    """分类金额 + 占比。"""

    name: str
    amount: float
    percent: int


class StatsTrendItem(BaseModel):
    """单月支出趋势点。"""

    month: str
    amount: float


class StatsRankItem(BaseModel):
    """分类排行项。"""

    name: str
    amount: float


class StatsDailyItem(BaseModel):
    """近 7 天单日支出。"""

    date: str  # MM-DD
    amount: float


class StatsOverviewResponse(BaseModel):
    """统计页总览出参。"""

    total: float
    count: int
    by_category: list[StatsCategoryItem]
    monthly_trend: list[StatsTrendItem]
    top_categories: list[StatsRankItem]
    last_7_days: list[StatsDailyItem] = []
    # 连续记账天数（与 mode/month 无关，始终相对今天）
    streak_days: int = 0
