"""独立统计页：月度总览 / 年度总览 / 分类占比 / 趋势 / 近 7 天 / 分类排行。"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import schemas
from ..core.security import get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..models import Bill
from ..timeutil import CN_TZ, month_range, resolve_month, year_range

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])

# 合法 mode
VALID_MODES = frozenset({"month", "year"})


def _shift_month(month: str, delta: int) -> str:
    """月份加减，delta 为负数表示往前推。"""
    year, mon = map(int, month.split("-"))
    mon += delta
    while mon < 1:
        mon += 12
        year -= 1
    while mon > 12:
        mon -= 12
        year += 1
    return f"{year:04d}-{mon:02d}"


def _last_n_months(end_month: str, n: int = 6) -> list[str]:
    """以 end_month 为终点，往前共 n 个月（含终点），升序。"""
    return [_shift_month(end_month, i - (n - 1)) for i in range(n)]


def _months_of_year(year: int) -> list[str]:
    """某年 1–12 月，格式 YYYY-MM。"""
    return [f"{year:04d}-{m:02d}" for m in range(1, 13)]


def _sum_and_count(
    db: Session, user_id: int, start: datetime, end: datetime
) -> tuple[float, int]:
    """时间范围内总支出 + 笔数。"""
    total_raw, count = (
        db.query(
            func.coalesce(func.sum(Bill.amount), 0),
            func.count(Bill.id),
        )
        .filter(
            Bill.user_id == user_id,
            Bill.bill_time >= start,
            Bill.bill_time <= end,
        )
        .one()
    )
    return round(float(total_raw), 2), int(count)


def _by_category(
    db: Session, user_id: int, start: datetime, end: datetime, total: float
) -> list[schemas.StatsCategoryItem]:
    """按分类汇总金额与占比（金额降序）。"""
    cat_rows = (
        db.query(
            Bill.category,
            func.sum(Bill.amount).label("amt"),
        )
        .filter(
            Bill.user_id == user_id,
            Bill.bill_time >= start,
            Bill.bill_time <= end,
        )
        .group_by(Bill.category)
        .order_by(func.sum(Bill.amount).desc())
        .all()
    )
    items: list[schemas.StatsCategoryItem] = []
    for cat, amt in cat_rows:
        amount = round(float(amt), 2)
        percent = int(round(amount / total * 100)) if total > 0 else 0
        items.append(
            schemas.StatsCategoryItem(
                name=cat or "其他",
                amount=amount,
                percent=percent,
            )
        )
    return items


def _monthly_trend(
    db: Session, user_id: int, months: list[str]
) -> list[schemas.StatsTrendItem]:
    """按给定月份列表聚合每月支出（缺月补 0）。"""
    if not months:
        return []
    trend_start, _ = month_range(months[0])
    _, trend_end = month_range(months[-1])

    # PostgreSQL：按东八区日历月聚合
    month_expr = func.to_char(
        func.timezone("Asia/Shanghai", Bill.bill_time), "YYYY-MM"
    )
    trend_rows = (
        db.query(
            month_expr.label("m"),
            func.coalesce(func.sum(Bill.amount), 0).label("amt"),
        )
        .filter(
            Bill.user_id == user_id,
            Bill.bill_time >= trend_start,
            Bill.bill_time <= trend_end,
        )
        .group_by(month_expr)
        .all()
    )
    trend_map = {str(m): round(float(amt), 2) for m, amt in trend_rows}
    return [
        schemas.StatsTrendItem(month=m, amount=trend_map.get(m, 0.0)) for m in months
    ]


def _last_7_days(db: Session, user_id: int) -> list[schemas.StatsDailyItem]:
    """最近 7 天（相对今天），与所选月/年无关。"""
    now = datetime.now(CN_TZ)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day0 = today - timedelta(days=6)
    day_end = today.replace(hour=23, minute=59, second=59, microsecond=999999)

    day_expr = func.to_char(
        func.timezone("Asia/Shanghai", Bill.bill_time), "YYYY-MM-DD"
    )
    day_rows = (
        db.query(
            day_expr.label("d"),
            func.coalesce(func.sum(Bill.amount), 0).label("amt"),
        )
        .filter(
            Bill.user_id == user_id,
            Bill.bill_time >= day0,
            Bill.bill_time <= day_end,
        )
        .group_by(day_expr)
        .all()
    )
    day_map = {str(d): round(float(amt), 2) for d, amt in day_rows}

    result: list[schemas.StatsDailyItem] = []
    for i in range(7):
        d = day0 + timedelta(days=i)
        key = d.strftime("%Y-%m-%d")
        result.append(
            schemas.StatsDailyItem(
                date=d.strftime("%m-%d"),
                amount=day_map.get(key, 0.0),
            )
        )
    return result


def _streak_days(db: Session, user_id: int) -> int:
    """
    连续记账天数（东八区日历日）。
    今天有账从今天往前数；今天没有则从昨天开始；断层即停。
    """
    day_expr = func.to_char(
        func.timezone("Asia/Shanghai", Bill.bill_time), "YYYY-MM-DD"
    )
    rows = (
        db.query(day_expr.label("d"))
        .filter(Bill.user_id == user_id)
        .distinct()
        .all()
    )
    if not rows:
        return 0

    day_set = {str(r[0]) for r in rows}
    today = datetime.now(CN_TZ).date()
    today_key = today.strftime("%Y-%m-%d")
    cursor = today if today_key in day_set else today - timedelta(days=1)

    streak = 0
    while cursor.strftime("%Y-%m-%d") in day_set:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return streak


@router.post("/overview", response_model=schemas.StatsOverviewResponse)
def stats_overview(
    body: schemas.StatsOverviewRequest,
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """
    统计总览。
    - mode=month（默认）：当月总支出/笔数、分类占比、近 6 月趋势、近 7 天、分类排行
    - mode=year：全年总支出/笔数、分类占比、1–12 月趋势、分类排行（不含近 7 天）
    入参 month 为 YYYY-MM；不传默认当月。年度模式取其年份。
    """
    user = get_current_user(db, openid)
    mode = (body.mode or "month").strip().lower()
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="mode 应为 month 或 year")

    month = resolve_month(body.month)
    year = int(month.split("-")[0])

    if mode == "year":
        start, end = year_range(year)
        months = _months_of_year(year)
        last_7: list[schemas.StatsDailyItem] = []
    else:
        start, end = month_range(month)
        months = _last_n_months(month, 6)
        last_7 = _last_7_days(db, user.id)

    total, count = _sum_and_count(db, user.id, start, end)
    by_category = _by_category(db, user.id, start, end, total)
    top_categories = [
        schemas.StatsRankItem(name=c.name, amount=c.amount) for c in by_category
    ]
    monthly_trend = _monthly_trend(db, user.id, months)
    streak_days = _streak_days(db, user.id)

    return schemas.StatsOverviewResponse(
        total=total,
        count=count,
        by_category=by_category,
        monthly_trend=monthly_trend,
        top_categories=top_categories,
        last_7_days=last_7,
        streak_days=streak_days,
    )
