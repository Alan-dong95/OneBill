"""账单 CRUD。"""

import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..constants import ALLOWED_CATEGORIES, CATEGORY_ORDER, LEGACY_CATEGORY_MAP


class BillCreate(BaseModel):
    amount: float = Field(..., gt=0, description="金额必须大于 0")
    category: str = Field(..., min_length=1, max_length=32)
    sub_category: str | None = Field(None, max_length=64)
    description: str | None = Field(None, max_length=500)
    source: str = Field("manual", max_length=32)
    raw_text: str | None = Field(None, max_length=1000)  # AI 原文，可选
    bill_time: datetime.datetime
    # 早上/中午/晚上/白天；有精确钟点时为 null
    time_period: str | None = Field(None, max_length=16)
    # 打开后这笔会同时登记为周期账单
    is_recurring: bool = False
    recurring_type: str | None = Field(None, description="monthly | weekly")
    # 每月几号 1-31，或每周几 0=周一 … 6=周日
    recurring_day: int | None = Field(None, ge=0, le=31)

    @field_validator("category")
    @classmethod
    def _normalize_category(cls, v: str) -> str:
        name = (v or "").strip()
        name = LEGACY_CATEGORY_MAP.get(name, name)
        if name not in ALLOWED_CATEGORIES:
            raise ValueError(f"分类须为：{'/'.join(CATEGORY_ORDER)}")
        return name

    @field_validator("recurring_type")
    @classmethod
    def _normalize_recurring_type(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        t = v.strip().lower()
        if t not in ("monthly", "weekly"):
            raise ValueError("recurring_type 须为 monthly 或 weekly")
        return t

    @model_validator(mode="after")
    def _check_recurring(self) -> "BillCreate":
        if not self.is_recurring:
            return self
        if not self.recurring_type:
            raise ValueError("开启重复记账时须指定 recurring_type")
        if self.recurring_day is None:
            raise ValueError("开启重复记账时须指定 recurring_day")
        day = int(self.recurring_day)
        if self.recurring_type == "monthly":
            if day < 1 or day > 31:
                raise ValueError("每月日期须为 1–31")
        else:
            if day < 0 or day > 6:
                raise ValueError("每周几须为 0–6（0=周一）")
        return self


class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: float
    category: str
    sub_category: str | None
    description: str | None
    source: str
    bill_time: datetime.datetime
    time_period: str | None = None


class BillBatchCreate(BaseModel):
    """批量创建入参；整批校验，任一条不合法则整请求失败。"""

    bills: list[BillCreate] = Field(..., min_length=1, max_length=50)


class BillBatchOut(BaseModel):
    """批量创建出参，顺序与入参一致。"""

    bills: list[BillOut]


class BillUpdate(BaseModel):
    """编辑账单入参（金额/分类/备注/时间）。"""

    amount: float = Field(..., gt=0, description="金额必须大于 0")
    category: str = Field(..., min_length=1, max_length=32)
    description: str | None = Field(None, max_length=500)
    bill_time: datetime.datetime

    @field_validator("category")
    @classmethod
    def _normalize_category(cls, v: str) -> str:
        name = (v or "").strip()
        name = LEGACY_CATEGORY_MAP.get(name, name)
        if name not in ALLOWED_CATEGORIES:
            raise ValueError(f"分类须为：{'/'.join(CATEGORY_ORDER)}")
        return name


class BillUpdateOut(BaseModel):
    """编辑账单出参。"""

    ok: bool = True
    bill: BillOut


class BillListOut(BaseModel):
    """账单分页列表。"""

    total: int
    bills: list[BillOut]
    has_more: bool
