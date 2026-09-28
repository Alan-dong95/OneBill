"""周期账单：列表 / 删除。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..core.security import get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..models import RecurringBill
from ..services.recurring import period_label

router = APIRouter(prefix="/api/v1/recurring", tags=["recurring"])


def _to_out(rb: RecurringBill) -> schemas.RecurringBillOut:
    return schemas.RecurringBillOut(
        id=rb.id,
        amount=float(rb.amount),
        category=rb.category,
        description=rb.description,
        recurring_type=rb.recurring_type,
        recurring_day=int(rb.recurring_day),
        period_label=period_label(rb.recurring_type, int(rb.recurring_day)),
        next_date=rb.next_date,
        created_at=rb.created_at,
    )


@router.get("", response_model=schemas.RecurringBillListOut)
def list_recurring(
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """当前用户全部周期账单，按下次扣款日升序。"""
    user = get_current_user(db, openid)
    rows = (
        db.query(RecurringBill)
        .filter(RecurringBill.user_id == user.id)
        .order_by(RecurringBill.next_date.asc(), RecurringBill.id.asc())
        .all()
    )
    return schemas.RecurringBillListOut(items=[_to_out(r) for r in rows])


@router.delete("/{recurring_id}")
def delete_recurring(
    recurring_id: int,
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """删除一条周期账单（不影响已生成的历史账单）。"""
    user = get_current_user(db, openid)
    rb = (
        db.query(RecurringBill)
        .filter(RecurringBill.id == recurring_id, RecurringBill.user_id == user.id)
        .first()
    )
    if not rb:
        raise HTTPException(status_code=404, detail="周期账单不存在")
    db.delete(rb)
    db.commit()
    return {"ok": True}
