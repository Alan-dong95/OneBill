"""月度预算：设置 / 查询（含本月已花与进度）。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import schemas
from ..core.security import get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..models import Bill
from ..timeutil import month_range, resolve_month

router = APIRouter(prefix="/api/v1/budget", tags=["budget"])

# 预算上限防误填天文数字
MAX_BUDGET = 1_000_000


def _month_spent(db: Session, user_id: int) -> float:
    """东八区当月支出合计。"""
    month = resolve_month(None)
    start, end = month_range(month)
    total_raw = (
        db.query(func.coalesce(func.sum(Bill.amount), 0))
        .filter(
            Bill.user_id == user_id,
            Bill.bill_time >= start,
            Bill.bill_time <= end,
        )
        .scalar()
    )
    return round(float(total_raw or 0), 2)


def _budget_out(monthly_budget: float, spent: float) -> schemas.BudgetOut:
    budget = round(float(monthly_budget or 0), 2)
    # 未设预算时剩余无意义，固定 0
    remaining = round(budget - spent, 2) if budget > 0 else 0.0
    # 未设预算时 percent=0，前端据此不提醒
    percent = round(spent / budget * 100, 1) if budget > 0 else 0.0
    return schemas.BudgetOut(
        monthly_budget=budget,
        spent=spent,
        remaining=remaining,
        percent=percent,
    )


@router.get("", response_model=schemas.BudgetOut)
def get_budget(
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """获取当前用户月度预算及本月花费进度。"""
    user = get_current_user(db, openid)
    spent = _month_spent(db, user.id)
    return _budget_out(float(user.monthly_budget or 0), spent)


@router.post("", response_model=schemas.BudgetOut)
def set_budget(
    body: schemas.BudgetSet,
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """设置月度预算；传 0 表示不设预算。"""
    amount = round(float(body.monthly_budget), 2)
    if amount < 0:
        raise HTTPException(status_code=400, detail="预算不能是负数")
    if amount > MAX_BUDGET:
        raise HTTPException(status_code=400, detail="预算有点夸张，先设小点吧")

    user = get_current_user(db, openid)
    user.monthly_budget = amount
    db.commit()
    db.refresh(user)

    spent = _month_spent(db, user.id)
    return _budget_out(float(user.monthly_budget or 0), spent)
