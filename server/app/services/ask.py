"""账单问答：意图理解 → 聚合 SQL / 明细向量检索。"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..constants import ALLOWED_CATEGORIES, CATEGORY_ORDER, LEGACY_CATEGORY_MAP
from ..models import Bill
from ..timeutil import CN_TZ, month_bounds, year_range
from .bill_vector import vector_literal
from .embedding import get_embedding
from .llm import chat_json, get_llm_client, get_llm_model, strip_code_fence

logger = logging.getLogger(__name__)

# LLM 结构化时间：year_2026 / month_2026_09
YEAR_SCOPE_RE = re.compile(r"^year_(\d{4})$")
MONTH_SCOPE_RE = re.compile(r"^month_(\d{4})_(\d{2})$")

SYSTEM_PROMPT = (
    "你是韭菜保护本的AI财务助手，根据用户给你的账单记录回答问题。"
    "口语化、简短、像朋友聊天。只根据提供的账单回答，不要编造。"
    "如果账单里没有相关信息，就说「韭菜保护协会没找到相关记录」。"
    "回答可以用简单 markdown 格式：重要数字用**加粗**，列举用短横线列表。"
    "不要用标题、表格、代码块，保持简洁。"
)

_CAT_LIST = "/".join(CATEGORY_ORDER)

INTENT_SYSTEM_PROMPT = f"""你是一个记账问答的意图理解器。用户会问各种关于账单的问题，
你要判断问题类型，输出 JSON，不要输出其他内容。

type 取值：
- aggregate：用户问统计/汇总（总共、花了多少、一共、这个月花、今年花、分类花了多少）
- lookup：用户找具体某笔/某笔什么时候/某笔花了多少

time_scope 取值（必须展开成具体年月编码，不要写「今年/这个月」字面量）：
- year_YYYY：问今年或某年，例如 year_2026
- month_YYYY_MM：问这个月/上个月/某月，例如 month_2026_09、month_2026_08
- null：没明确时间

category 取值：
- {_CAT_LIST}（12个分类之一）
- null：没指定分类

输出格式：
{{ "type": "...", "time_scope": "...", "category": "..." }}
"""

FALLBACK_ANSWER = (
    "小韭菜这会儿卡壳了，过会儿再问一次呗。"
    "韭菜保护协会提醒你：账还在，别慌。"
)

EMPTY_BILLS_ANSWER = "先记几笔再来问"


def format_bill_line(row: dict) -> str:
    """把一笔账单拼成一行上下文。"""
    bill_time = row.get("bill_time")
    time_str = (
        bill_time.strftime("%Y-%m-%d %H:%M")
        if hasattr(bill_time, "strftime")
        else str(bill_time or "")
    )
    category = row.get("category") or "其他"
    amount = row.get("amount")
    try:
        amount_str = f"{float(amount):.2f}"
    except (TypeError, ValueError):
        amount_str = str(amount)
    desc = (row.get("description") or "").strip() or "无备注"
    return f"{time_str}｜{category}｜¥{amount_str}｜{desc}"


def parse_time_scope(
    time_scope: str | None,
) -> tuple[datetime | None, datetime | None, str]:
    """
    把 LLM 的 time_scope 编码解析成 SQL 时间窗。
    - year_2026 → 2026-01-01 ~ 2026-12-31
    - month_2026_09 → 2026-09-01 ~ 2026-09-30
    - null / 无法解析 → 不加时间过滤
    """
    if not time_scope:
        return None, None, "全部"

    scope = str(time_scope).strip()

    ym = YEAR_SCOPE_RE.match(scope)
    if ym:
        year = int(ym.group(1))
        start, end = year_range(year)
        return start, end, f"{year}年"

    mm = MONTH_SCOPE_RE.match(scope)
    if mm:
        year = int(mm.group(1))
        month = int(mm.group(2))
        if 1 <= month <= 12:
            start, end = month_bounds(year, month)
            return start, end, f"{year}-{month:02d}"

    logger.warning("无法解析 time_scope=%r，不加时间过滤", time_scope)
    return None, None, scope


def classify_intent(question: str) -> dict:
    """
    第一步：调 LLM 做结构化意图理解。
    解析失败由调用方兜底为 lookup。
    """
    now = datetime.now(CN_TZ)
    user_content = (
        f"今天是 {now.strftime('%Y-%m-%d')}（当前年={now.year}，当前月={now.month:02d}）。\n"
        f"用户问题：{question}"
    )

    raw = strip_code_fence(
        chat_json(
            [
                {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
    )
    data = json.loads(raw)

    intent_type = str(data.get("type") or "").strip().lower()
    if intent_type not in ("aggregate", "lookup"):
        raise ValueError(f"非法意图 type={intent_type!r}")

    time_scope = data.get("time_scope")
    if time_scope is not None:
        time_scope = str(time_scope).strip() or None
        if time_scope and time_scope.lower() == "null":
            time_scope = None

    category = data.get("category")
    if category is not None:
        category = str(category).strip() or None
        if category and category.lower() == "null":
            category = None
        if category and category not in ALLOWED_CATEGORIES:
            mapped = LEGACY_CATEGORY_MAP.get(category)
            category = mapped if mapped in ALLOWED_CATEGORIES else None

    return {
        "type": intent_type,
        "time_scope": time_scope,
        "category": category,
    }


def aggregate_stats(
    db: Session,
    user_id: int,
    time_scope: str | None,
    category: str | None,
) -> dict:
    """SQL 真实聚合，不走向量检索。返回总金额、笔数、分类明细。"""
    start, end, scope_label = parse_time_scope(time_scope)

    params: dict = {"uid": user_id}
    time_clause = ""
    if start is not None and end is not None:
        time_clause = " AND bill_time >= :start AND bill_time <= :end"
        params["start"] = start
        params["end"] = end

    cat_clause = ""
    if category:
        cat_clause = " AND category = :category"
        params["category"] = category

    total_sql = text(
        f"""
        SELECT COALESCE(SUM(amount), 0) AS total,
               COUNT(*) AS cnt
        FROM bills
        WHERE user_id = :uid
          {time_clause}
          {cat_clause}
        """
    )
    total_row = db.execute(total_sql, params).mappings().one()
    total = float(total_row["total"] or 0)
    count = int(total_row["cnt"] or 0)

    by_cat_sql = text(
        f"""
        SELECT category,
               COALESCE(SUM(amount), 0) AS amount,
               COUNT(*) AS cnt
        FROM bills
        WHERE user_id = :uid
          {time_clause}
          {cat_clause}
        GROUP BY category
        ORDER BY amount DESC
        """
    )
    by_category = [
        {
            "category": r["category"],
            "amount": float(r["amount"] or 0),
            "count": int(r["cnt"] or 0),
        }
        for r in db.execute(by_cat_sql, params).mappings()
    ]

    return {
        "time_scope": scope_label,
        "category_filter": category,
        "total": round(total, 2),
        "count": count,
        "by_category": by_category,
    }


def format_aggregate_context(stats: dict) -> str:
    """把 SQL 统计结果拼成给 LLM 的上下文。"""
    lines = [
        f"统计范围：{stats['time_scope']}",
        f"筛选分类：{stats['category_filter'] or '全部'}",
        f"总金额：¥{stats['total']:.2f}",
        f"总笔数：{stats['count']}",
        "分类明细：",
    ]
    if not stats["by_category"]:
        lines.append("（无账单）")
    else:
        for item in stats["by_category"]:
            lines.append(
                f"- {item['category']}：¥{item['amount']:.2f}（{item['count']}笔）"
            )
    return "\n".join(lines)


def search_similar_bills(
    db: Session,
    user_id: int,
    qvec: list[float],
    limit: int = 5,
    time_scope: str | None = None,
    category: str | None = None,
):
    """pgvector 余弦距离检索；可选时间窗 / 分类。"""
    vec = vector_literal(qvec)
    start, end, _ = parse_time_scope(time_scope)

    params: dict = {"uid": user_id, "qvec": vec, "lim": limit}
    clauses = ["b.user_id = :uid"]
    if start is not None and end is not None:
        clauses.append("b.bill_time >= :start AND b.bill_time <= :end")
        params["start"] = start
        params["end"] = end
    if category:
        clauses.append("b.category = :category")
        params["category"] = category

    where_sql = " AND ".join(clauses)
    sql = text(
        f"""
        SELECT b.id, b.amount, b.category, b.description, b.bill_time
        FROM bills b
        JOIN bill_vectors v ON b.id = v.bill_id
        WHERE {where_sql}
        ORDER BY v.embedding <=> CAST(:qvec AS vector)
        LIMIT :lim
        """
    )
    result = db.execute(sql, params)
    return [dict(row._mapping) for row in result]


def ask_llm(user_message: str) -> str:
    """上下文 + 问题 → 自然语言回答。"""
    from openai import APITimeoutError

    client = get_llm_client()
    try:
        completion = client.chat.completions.create(
            model=get_llm_model(),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
        )
    except APITimeoutError:
        return FALLBACK_ANSWER
    answer = (completion.choices[0].message.content or "").strip()
    return answer or FALLBACK_ANSWER


def answer_via_lookup(
    db: Session,
    user_id: int,
    question: str,
    time_scope: str | None = None,
    category: str | None = None,
) -> str:
    """lookup：向量 Top5 → LLM 组织回答。"""
    qvec = get_embedding(question)
    rows = search_similar_bills(
        db,
        user_id,
        qvec,
        limit=5,
        time_scope=time_scope,
        category=category,
    )
    if not rows:
        if time_scope or category:
            return (
                "这个范围里没翻到相关账单。"
                "换个说法，或放宽时间/分类再问一次。"
            )
        return "账单还没向量化完，先再记一笔或稍后再问。韭菜保护协会先歇会儿。"
    context = "\n".join(format_bill_line(r) for r in rows)
    user_message = (
        f"以下是与问题最相关的账单记录：\n{context}\n\n"
        f"用户问题：{question}"
    )
    return ask_llm(user_message)


def answer_question(db: Session, user_id: int, question: str) -> str:
    """
    两步问答编排：意图 → aggregate SQL / lookup 向量。
    意图失败兜底 lookup；处理失败返回 FALLBACK_ANSWER。
    """
    bill_count = db.query(Bill).filter(Bill.user_id == user_id).count()
    if bill_count == 0:
        return EMPTY_BILLS_ANSWER

    try:
        intent = classify_intent(question)
    except HTTPException:
        raise
    except Exception:
        logger.exception("意图识别失败，兜底 lookup user_id=%s", user_id)
        intent = {"type": "lookup", "time_scope": None, "category": None}

    logger.info(
        "问答意图 user_id=%s type=%s time_scope=%s category=%s",
        user_id,
        intent["type"],
        intent.get("time_scope"),
        intent.get("category"),
    )

    try:
        if intent["type"] == "aggregate":
            stats = aggregate_stats(
                db,
                user_id,
                intent.get("time_scope"),
                intent.get("category"),
            )
            context = format_aggregate_context(stats)
            user_message = (
                f"以下是根据数据库统计得到的真实结果（请据此回答，金额以统计为准）：\n"
                f"{context}\n\n"
                f"用户问题：{question}"
            )
            return ask_llm(user_message)
        return answer_via_lookup(
            db,
            user_id,
            question,
            intent.get("time_scope"),
            intent.get("category"),
        )
    except Exception:
        logger.exception("问答处理失败 user_id=%s type=%s", user_id, intent["type"])
        return FALLBACK_ANSWER
