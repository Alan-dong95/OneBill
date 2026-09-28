"""Pydantic 入出参：按域拆分，此处统一再导出，兼容 `from .. import schemas`。"""

from .ai import AiOcrRequest, AiParseRequest, AiParseResponse, AiParseResult
from .ask import AskRequest, AskResponse
from .auth import LoginRequest, LoginResponse, UserOut, UserUpdate
from .bills import (
    BillBatchCreate,
    BillBatchOut,
    BillCreate,
    BillListOut,
    BillOut,
    BillUpdate,
    BillUpdateOut,
)
from .budget import BudgetOut, BudgetSet
from .feedback import MAX_FEEDBACK_IMAGE_CHARS, FeedbackCreate, FeedbackOut
from .meta import CategoriesOut
from .recurring import RecurringBillListOut, RecurringBillOut
from .report import (
    CategoryStat,
    MonthlyReportRequest,
    MonthlyReportResponse,
    MonthlyStats,
    TopExpense,
)
from .stats import (
    StatsCategoryItem,
    StatsDailyItem,
    StatsOverviewRequest,
    StatsOverviewResponse,
    StatsRankItem,
    StatsTrendItem,
)

__all__ = [
    "AiOcrRequest",
    "AiParseRequest",
    "AiParseResponse",
    "AiParseResult",
    "AskRequest",
    "AskResponse",
    "BillBatchCreate",
    "BillBatchOut",
    "BillCreate",
    "BillListOut",
    "BillOut",
    "BillUpdate",
    "BillUpdateOut",
    "BudgetOut",
    "BudgetSet",
    "CategoriesOut",
    "CategoryStat",
    "FeedbackCreate",
    "FeedbackOut",
    "LoginRequest",
    "LoginResponse",
    "MAX_FEEDBACK_IMAGE_CHARS",
    "MonthlyReportRequest",
    "MonthlyReportResponse",
    "MonthlyStats",
    "RecurringBillListOut",
    "RecurringBillOut",
    "StatsCategoryItem",
    "StatsDailyItem",
    "StatsOverviewRequest",
    "StatsOverviewResponse",
    "StatsRankItem",
    "StatsTrendItem",
    "TopExpense",
    "UserOut",
    "UserUpdate",
]
