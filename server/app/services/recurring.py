"""周期账单：下次日期计算 + 到期自动入账。"""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from ..models import Bill, RecurringBill
from ..services.bill_vector import embed_bill_by_id
from ..timeutil import CN_TZ, month_key_of

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")


def clamp_month_day(year: int, month: int, day: int) -> int:
    """把「每月几号」夹到当月合法日（如 31 → 2 月变 28/29）。"""
    last = calendar.monthrange(year, month)[1]
    return min(max(day, 1), last)


def next_monthly_date(after: date, day: int) -> date:
    """严格晚于 after 的下一个「每月 day 号」（缺日则当月最后一天）。"""
    y, m = after.year, after.month
    # 先看本月：若本月目标日仍晚于 after，就用本月
    this_day = clamp_month_day(y, m, day)
    candidate = date(y, m, this_day)
    if candidate > after:
        return candidate
    # 否则下个月起找
    if m == 12:
        y, m = y + 1, 1
    else:
        m += 1
    return date(y, m, clamp_month_day(y, m, day))


def next_weekly_date(after: date, weekday: int) -> date:
    """严格晚于 after 的下一个 weekday（0=周一 … 6=周日）。"""
    weekday = int(weekday) % 7
    delta = (weekday - after.weekday() + 7) % 7
    if delta == 0:
        delta = 7
    return after + timedelta(days=delta)


def calc_next_date(after: date, recurring_type: str, recurring_day: int) -> date:
    """按类型算下一次扣款日。"""
    if recurring_type == "weekly":
        return next_weekly_date(after, recurring_day)
    return next_monthly_date(after, recurring_day)


def period_label(recurring_type: str, recurring_day: int) -> str:
    """列表展示用：「每月15日」/「每周三」。"""
    if recurring_type == "weekly":
        name = WEEKDAY_NAMES[int(recurring_day) % 7]
        return f"每{name}"
    return f"每月{int(recurring_day)}日"


def today_cn() -> date:
    """东八区今天的日历日。"""
    return datetime.now(CN_TZ).date()


def _invalidate_monthly_report(db: Session, user_id: int, month: str) -> None:
    """账单变更后清掉该月 AI 复盘缓存。"""
    from ..models import MonthlyReport

    db.query(MonthlyReport).filter(
        MonthlyReport.user_id == user_id,
        MonthlyReport.month == month,
    ).delete(synchronize_session=False)


def process_due_recurring_bills(db: Session | None = None) -> int:
    """
    处理到期周期账单：next_date <= 今天则自动入账一笔，并把 next_date 推到下一周期。
    返回本次新建账单笔数。可传入已有 Session（测试用），否则自建会话。
    """
    from ..database import SessionLocal

    own_session = db is None
    if own_session:
        db = SessionLocal()
    assert db is not None

    created = 0
    bill_ids: list[int] = []
    try:
        today = today_cn()
        due_list = (
            db.query(RecurringBill)
            .filter(RecurringBill.next_date <= today)
            .order_by(RecurringBill.id.asc())
            .all()
        )
        for rb in due_list:
            # 入账日用「今天」，漏跑也不堆多笔，只补记一笔
            bill_time = datetime(
                today.year, today.month, today.day, 12, 0, 0, tzinfo=CN_TZ
            )
            bill = Bill(
                user_id=rb.user_id,
                amount=rb.amount,
                category=rb.category,
                description=rb.description,
                source="recurring",
                bill_time=bill_time,
                time_period=None,
            )
            db.add(bill)
            _invalidate_monthly_report(db, rb.user_id, month_key_of(bill_time))
            # 推到严格晚于今天的下一次
            rb.next_date = calc_next_date(today, rb.recurring_type, rb.recurring_day)
            db.flush()
            bill_ids.append(bill.id)
            created += 1

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("周期账单自动入账失败")
        raise
    finally:
        if own_session:
            db.close()

    # 向量异步写，不占用上面事务
    for bid in bill_ids:
        try:
            embed_bill_by_id(bid)
        except Exception:
            logger.exception("周期账单写向量失败 bill_id=%s", bid)

    if created:
        logger.info("周期账单自动入账 %s 笔", created)
    return created
