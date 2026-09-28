"""东八区时间工具：月范围、解析、账单月份键。"""

from __future__ import annotations

import calendar
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

CN_TZ = timezone(timedelta(hours=8))
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def resolve_month(month: str | None) -> str:
    """解析月份；空则当月；非法格式 400。"""
    if not month:
        now = datetime.now(CN_TZ)
        return f"{now.year:04d}-{now.month:02d}"
    month = month.strip()
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=400, detail="month 格式应为 YYYY-MM")
    return month


def month_range(month: str) -> tuple[datetime, datetime]:
    """YYYY-MM 起止（东八区，含月末最后一刻）。"""
    year, mon = map(int, month.split("-"))
    return month_bounds(year, mon)


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    """指定年月起止（东八区）。"""
    last_day = calendar.monthrange(year, month)[1]
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=CN_TZ)
    end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=CN_TZ)
    return start, end


def year_range(year: int) -> tuple[datetime, datetime]:
    """自然年起止（东八区）。"""
    start = datetime(year, 1, 1, 0, 0, 0, tzinfo=CN_TZ)
    end = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=CN_TZ)
    return start, end


def days_for_avg(month: str) -> int:
    """日均分母：当月用已过天数，往月用整月天数。"""
    year, mon = map(int, month.split("-"))
    now = datetime.now(CN_TZ)
    last_day = calendar.monthrange(year, mon)[1]
    if year == now.year and mon == now.month:
        return max(now.day, 1)
    return last_day


def month_key_of(dt: datetime) -> str:
    """账单时间 → YYYY-MM（东八区日历月）。"""
    if dt.tzinfo is None:
        local = dt.replace(tzinfo=CN_TZ)
    else:
        local = dt.astimezone(CN_TZ)
    return local.strftime("%Y-%m")


def now_cn_naive() -> datetime:
    """东八区「现在」，剥掉 tzinfo（与历史 naive bill_time 对齐）。"""
    return datetime.now(CN_TZ).replace(tzinfo=None)
