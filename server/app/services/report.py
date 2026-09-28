"""月度 AI 复盘：SQL 统计 + LLM 文案 + 缓存读写。"""

from __future__ import annotations

import json

from fastapi import HTTPException
from openai import APITimeoutError
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import schemas
from ..models import Bill, MonthlyReport, User
from ..timeutil import days_for_avg, month_range, resolve_month
from .llm import get_llm_client, get_llm_model

SYSTEM_PROMPT = """你是「韭菜保护本」的 AI 财务助手，韭菜保护协会的官方账本。
风格：犀利、有梗、不鸡汤、像朋友吐槽、短句、像微信聊天。
用户给你本月账单统计数据，你要写一段 200-300 字的月度复盘：
1. 先一句话点题：这个月总共花了多少、比日常水平如何
2. 指出「被谁割了」——哪个分类花得最多、哪笔最离谱
3. 一句具体建议（别空泛，比如「下午3点那杯奶茶别再点了」）
4. 结尾用韭菜保护协会的口吻，比如「韭菜保护协会提醒你：...」
禁止：不要列数据表格、不要说「您」、不要官方腔。
回答可以用简单 markdown 格式：重要数字用**加粗**，列举用短横线列表。不要用标题、表格、代码块，保持简洁。
只输出复盘正文。"""

FALLBACK_SUMMARY = (
    "账本这会儿卡壳了，复盘文字暂时写不出来。"
    "上面的统计先瞅一眼，晚点再点「重新生成」。"
    "韭菜保护协会提醒你：刀口再深，账也得先记清楚。"
)


def build_stats(db: Session, user_id: int, month: str) -> schemas.MonthlyStats:
    """SQL 聚合本月支出（不再全量拉账单进内存）。"""
    start, end = month_range(month)
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
    total = round(float(total_raw), 2)
    count = int(count)
    days = days_for_avg(month)
    avg = round(total / days, 2) if count else 0.0

    cat_rows = (
        db.query(
            Bill.category,
            func.coalesce(func.sum(Bill.amount), 0).label("amt"),
            func.count(Bill.id).label("cnt"),
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

    by_category: list[schemas.CategoryStat] = []
    for cat, amt, cnt in cat_rows:
        amount = round(float(amt), 2)
        pct = round(amount / total * 100, 1) if total > 0 else 0.0
        by_category.append(
            schemas.CategoryStat(
                category=cat or "其他",
                amount=amount,
                count=int(cnt),
                percent=pct,
            )
        )

    top_expense = None
    biggest = (
        db.query(Bill)
        .filter(
            Bill.user_id == user_id,
            Bill.bill_time >= start,
            Bill.bill_time <= end,
        )
        .order_by(Bill.amount.desc(), Bill.id.desc())
        .first()
    )
    if biggest is not None:
        top_expense = schemas.TopExpense(
            id=biggest.id,
            amount=round(float(biggest.amount), 2),
            category=biggest.category,
            description=biggest.description,
            bill_time=biggest.bill_time,
        )

    top_by_count = None
    if by_category:
        top_by_count = max(by_category, key=lambda x: x.count).category

    return schemas.MonthlyStats(
        total_amount=total,
        bill_count=count,
        avg_per_day=avg,
        by_category=by_category,
        top_expense=top_expense,
        top_category_by_count=top_by_count,
    )


def stats_for_prompt(stats: schemas.MonthlyStats, month: str) -> str:
    """把统计打成给模型看的 user message。"""
    lines = [
        f"月份：{month}",
        f"总支出：{stats.total_amount} 元",
        f"笔数：{stats.bill_count}",
        f"日均：{stats.avg_per_day} 元",
        f"笔数最多分类：{stats.top_category_by_count or '无'}",
        "分类明细：",
    ]
    for c in stats.by_category:
        lines.append(f"- {c.category}：{c.amount} 元，{c.count} 笔，占 {c.percent}%")
    if stats.top_expense:
        te = stats.top_expense
        desc = te.description or te.category
        lines.append(
            f"最大一笔：{te.amount} 元，分类 {te.category}，事由「{desc}」，时间 {te.bill_time}"
        )
    else:
        lines.append("最大一笔：无")
    return "\n".join(lines)


def generate_summary(stats: schemas.MonthlyStats, month: str) -> str:
    """调 LLM 生成复盘文字；失败抛出异常由上层兜底。"""
    client = get_llm_client()
    try:
        completion = client.chat.completions.create(
            model=get_llm_model(),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": stats_for_prompt(stats, month)},
            ],
            temperature=0.7,
        )
    except APITimeoutError as e:
        raise TimeoutError("月报复盘超时") from e
    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("empty summary")
    return text


def empty_month_summary(month: str) -> str:
    return (
        f"{month} 一笔账都没有。"
        "不是没被割，是账本还空着。"
        "韭菜保护协会提醒你：先记一笔，才知道刀从哪来。"
    )


def monthly_report(
    db: Session,
    user: User,
    month: str | None,
    force: bool = False,
) -> schemas.MonthlyReportResponse:
    """生成月度复盘：缓存命中直接返回；force 删缓存重跑 LLM。"""
    month = resolve_month(month)
    stats = build_stats(db, user.id, month)

    cached_row = (
        db.query(MonthlyReport)
        .filter(MonthlyReport.user_id == user.id, MonthlyReport.month == month)
        .first()
    )
    if force and cached_row is not None:
        db.delete(cached_row)
        db.commit()
        cached_row = None

    if cached_row is not None:
        content = cached_row.content or {}
        summary = content.get("summary") if isinstance(content, dict) else None
        if summary and FALLBACK_SUMMARY not in str(summary):
            return schemas.MonthlyReportResponse(
                month=month,
                stats=stats,
                summary=str(summary),
                cached=True,
            )
        db.delete(cached_row)
        db.commit()
        cached_row = None

    if stats.bill_count == 0:
        return schemas.MonthlyReportResponse(
            month=month,
            stats=stats,
            summary=empty_month_summary(month),
            cached=False,
        )

    try:
        summary = generate_summary(stats, month)
    except HTTPException:
        return schemas.MonthlyReportResponse(
            month=month,
            stats=stats,
            summary=FALLBACK_SUMMARY,
            cached=False,
        )
    except Exception:
        return schemas.MonthlyReportResponse(
            month=month,
            stats=stats,
            summary=FALLBACK_SUMMARY,
            cached=False,
        )

    payload = {
        "summary": summary,
        "stats": json.loads(stats.model_dump_json()),
    }
    if cached_row is None:
        cached_row = MonthlyReport(user_id=user.id, month=month, content=payload)
        db.add(cached_row)
    else:
        cached_row.content = payload
    db.commit()

    return schemas.MonthlyReportResponse(
        month=month,
        stats=stats,
        summary=summary,
        cached=False,
    )
