"""账单路由：创建后异步写入向量（失败不阻塞主流程）。"""

import csv
import io
import logging
from collections.abc import Iterator
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from .. import schemas
from ..core.security import get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..models import Bill, MonthlyReport, RecurringBill
from ..services.bill_vector import embed_bill_by_id
from ..services.recurring import calc_next_date
from ..timeutil import CN_TZ, month_key_of, month_range, resolve_month

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bills", tags=["bills"])


def _invalidate_monthly_report(db: Session, user_id: int, month: str) -> None:
    """账单变更后清掉该月 AI 复盘缓存，避免文案与统计脱节。"""
    db.query(MonthlyReport).filter(
        MonthlyReport.user_id == user_id,
        MonthlyReport.month == month,
    ).delete(synchronize_session=False)


def _add_bill_from_create(db: Session, user_id: int, body: schemas.BillCreate) -> Bill:
    """写入一笔账单（及可选周期模板）；不 commit，便于单条/批量共用事务。"""
    # 周期字段不进 bills 表
    payload = body.model_dump(
        exclude={"is_recurring", "recurring_type", "recurring_day"}
    )
    bill = Bill(user_id=user_id, **payload)
    db.add(bill)

    if body.is_recurring and body.recurring_type and body.recurring_day is not None:
        # 下次扣款：严格晚于本次账单日期（今天已记过，不重复）
        bill_local = bill.bill_time
        if bill_local.tzinfo is None:
            bill_local = bill_local.replace(tzinfo=CN_TZ)
        else:
            bill_local = bill_local.astimezone(CN_TZ)
        after = bill_local.date()
        next_date = calc_next_date(after, body.recurring_type, int(body.recurring_day))
        db.add(
            RecurringBill(
                user_id=user_id,
                amount=body.amount,
                category=body.category,
                description=body.description,
                recurring_type=body.recurring_type,
                recurring_day=int(body.recurring_day),
                next_date=next_date,
            )
        )
    return bill


@router.post("", response_model=schemas.BillOut)
def create_bill(
    body: schemas.BillCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """创建一笔账单；可选同时登记周期模板；响应返回后异步写 embedding。"""
    user = get_current_user(db, openid)
    bill = _add_bill_from_create(db, user.id, body)
    # 同事务清月报缓存，保证增账后复盘不读旧文案
    _invalidate_monthly_report(db, user.id, month_key_of(bill.bill_time))

    db.commit()
    db.refresh(bill)

    # 独立会话写向量，不占用本请求连接
    background_tasks.add_task(embed_bill_by_id, bill.id)

    return bill


@router.post("/batch", response_model=schemas.BillBatchOut)
def create_bills_batch(
    body: schemas.BillBatchCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """批量创建账单；整批同一事务，失败则全部回滚。"""
    user = get_current_user(db, openid)
    bills: list[Bill] = []
    months: set[str] = set()
    for item in body.bills:
        bill = _add_bill_from_create(db, user.id, item)
        bills.append(bill)
        months.add(month_key_of(bill.bill_time))

    for month in months:
        _invalidate_monthly_report(db, user.id, month)

    db.commit()
    for bill in bills:
        db.refresh(bill)
        background_tasks.add_task(embed_bill_by_id, bill.id)

    return schemas.BillBatchOut(bills=bills)


@router.get("", response_model=schemas.BillListOut)
def list_bills(
    month: str | None = Query(None, description="可选，YYYY-MM；不传返回全部"),
    keyword: str | None = Query(None, description="可选，搜备注/分类；有值时忽略 month"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """当前用户账单分页列表，按时间倒序；keyword / month 可选筛选。"""
    user = get_current_user(db, openid)
    q = db.query(Bill).filter(Bill.user_id == user.id)

    kw = (keyword or "").strip()
    if kw:
        # 有关键词时跨全量搜备注/分类，忽略月份；转义 %/_ 防通配扩大
        escaped = (
            kw.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        like = f"%{escaped}%"
        q = q.filter(
            or_(
                Bill.description.ilike(like, escape="\\"),
                Bill.category.ilike(like, escape="\\"),
            )
        )
    elif month is not None and month.strip():
        month = resolve_month(month.strip())
        start, end = month_range(month)
        q = q.filter(Bill.bill_time >= start, Bill.bill_time <= end)

    total = q.count()
    bills = (
        q.order_by(Bill.bill_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return schemas.BillListOut(
        total=total,
        bills=bills,
        has_more=(page * page_size) < total,
    )


def _bill_date_local(dt: datetime) -> str:
    """账单时间转东八区日期（YYYY-MM-DD），给 CSV「日期」列用。"""
    if dt.tzinfo is None:
        local = dt.replace(tzinfo=CN_TZ)
    else:
        local = dt.astimezone(CN_TZ)
    return local.strftime("%Y-%m-%d")


@router.get("/export")
def export_bills(
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """流式导出当前用户全部账单为 CSV（UTF-8 BOM，Excel 打开不乱码）。"""
    user = get_current_user(db, openid)
    user_id = user.id
    filename = f"bills_{datetime.now(CN_TZ).strftime('%Y-%m')}.csv"

    def _iter_csv() -> Iterator[bytes]:
        # StreamingResponse 在依赖会话关闭后才消费，需独立 Session
        from ..database import SessionLocal

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["日期", "分类", "金额", "备注"])
        yield ("\ufeff" + buf.getvalue()).encode("utf-8")
        buf.seek(0)
        buf.truncate(0)

        session = SessionLocal()
        try:
            q = (
                session.query(Bill)
                .filter(Bill.user_id == user_id)
                .order_by(Bill.bill_time.desc())
                .yield_per(500)
            )
            for b in q:
                writer.writerow(
                    [
                        _bill_date_local(b.bill_time),
                        b.category or "",
                        f"{float(b.amount):.2f}",
                        b.description or "",
                    ]
                )
                yield buf.getvalue().encode("utf-8")
                buf.seek(0)
                buf.truncate(0)
        finally:
            session.close()

    return StreamingResponse(
        _iter_csv(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.put("/{bill_id}", response_model=schemas.BillUpdateOut)
def update_bill(
    bill_id: int,
    body: schemas.BillUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """更新当前用户的一笔账单；改完后异步重写 embedding。"""
    user = get_current_user(db, openid)
    bill = (
        db.query(Bill)
        .filter(Bill.id == bill_id, Bill.user_id == user.id)
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="账单不存在")

    old_month = month_key_of(bill.bill_time)
    new_month = month_key_of(body.bill_time)

    bill.amount = body.amount
    bill.category = body.category
    bill.description = body.description
    bill.bill_time = body.bill_time

    # 原月/新月都要清缓存，跨月改日期时两边统计都要对
    _invalidate_monthly_report(db, user.id, old_month)
    if new_month != old_month:
        _invalidate_monthly_report(db, user.id, new_month)

    db.commit()
    db.refresh(bill)

    # 金额/分类/备注变了，向量要跟着重算，问答才不跑偏
    background_tasks.add_task(embed_bill_by_id, bill.id)

    return schemas.BillUpdateOut(ok=True, bill=bill)


@router.delete("/{bill_id}")
def delete_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    openid: str = Depends(get_current_openid),
):
    """删除当前用户的一笔账单。"""
    user = get_current_user(db, openid)
    bill = (
        db.query(Bill)
        .filter(Bill.id == bill_id, Bill.user_id == user.id)
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="账单不存在")

    month = month_key_of(bill.bill_time)

    # 顺手清掉向量，避免孤儿行
    try:
        db.execute(
            text("DELETE FROM bill_vectors WHERE bill_id = :bill_id"),
            {"bill_id": bill_id},
        )
    except Exception:
        logger.exception("删除账单向量失败 bill_id=%s", bill_id)

    db.delete(bill)
    _invalidate_monthly_report(db, user.id, month)
    db.commit()
    return {"ok": True}
