"""周期账单。"""

import datetime

from pydantic import BaseModel, ConfigDict


class RecurringBillOut(BaseModel):
    """周期账单列表项。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: float
    category: str
    description: str | None
    recurring_type: str
    recurring_day: int
    # 展示文案：每月15日 / 每周三
    period_label: str
    next_date: datetime.date
    created_at: datetime.datetime | None = None


class RecurringBillListOut(BaseModel):
    """周期账单列表。"""

    items: list[RecurringBillOut]
