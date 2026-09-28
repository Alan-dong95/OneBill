"""月度预算。"""

from pydantic import BaseModel, Field


class BudgetSet(BaseModel):
    """设置月度预算；0 表示取消/不设预算。"""

    monthly_budget: float = Field(..., ge=0, description="月度预算金额，0=不设")


class BudgetOut(BaseModel):
    """当前预算 + 本月花费进度（东八区当月）。"""

    monthly_budget: float
    spent: float
    remaining: float
    # 已花/预算 百分比；预算为 0 时固定 0
    percent: float
