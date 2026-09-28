"""AI 自然语言 / OCR 文字 → 结构化记账草稿（不入库）。"""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import HTTPException

from .. import schemas
from ..constants import ALLOWED_CATEGORIES, ALLOWED_PERIODS, CATEGORY_ORDER, LEGACY_CATEGORY_MAP
from ..timeutil import now_cn_naive
from .llm import chat_json, strip_code_fence

UNCLEAR_AMOUNT_MSG = "没听清花了多少，再说清楚点金额"
UNCLEAR_OCR_AMOUNT_MSG = "小票上没认出明确金额，换张更清楚的再试"
INCOME_ONLY_MSG = "目前只记支出，工资收款先别往账本里塞"


def build_system_prompt(now: datetime) -> str:
    """构造带当前时间的 system prompt：支持一句拆多笔；时间优先精确，否则只给时段。"""
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    today = now.strftime("%Y-%m-%d")
    cat_list = "、".join(CATEGORY_ORDER)
    return f"""你是记账助手。从用户输入中提取所有记账条目，只输出严格 JSON，不要其它文字。
现在的时间是 {now_str}，请把「今天」「昨天」「上周」等相对日期转成具体日期。

【拆分规则 — 非常重要】
1. 用户可能一次说多笔消费/收入：每个独立金额必须拆成一条，禁止合并成一笔总金额。
2. 不同分类、不同事项、不同时间，一律各记一条。
3. 「午饭25、打车15、买菜30」→ 3 条；「今天花了午饭25地铁充值100」→ 2 条。
4. 只有明确是同一笔（如「午饭一共花了25」）才合为一条。
5. 金额模糊或没有数字的事项直接丢弃，不要编造金额。
6. 分类必须从这 12 个里选：{cat_list}。
7. description 只写该条简短事由，不要把整段原文塞进去。
8. 本产品只记支出。工资/收款/转入等收入不要放进 items；默认 is_expense=true。

【时间规则 — 非常重要，禁止猜整点】
1. 用户说了具体钟点（如「下午3点」「早上8点半」「12:30」）→ has_exact_time=true，
   bill_time 填完整 ISO 日期时间，time_period=null。
2. 用户只说了时段词、没说几点（如「昨晚」「今早」「中午」「傍晚」）→ has_exact_time=false，
   bill_time 只填对应日期的 00:00:00，time_period 用：早上/中午/晚上/白天。
   「昨晚/昨天晚上」→ 昨天 + 晚上；「今早/今天早上」→ 今天 + 早上。
3. 用户完全没提时间 → has_exact_time=false，bill_time 用今天 {today}T00:00:00，
   再按分类/事由推断 time_period：
   - 餐饮 + 早饭/早餐/早点 → 早上
   - 餐饮 + 午饭/午餐/中饭 → 中午
   - 餐饮 + 晚饭/晚餐/夜宵 → 晚上
   - 餐饮但看不出哪一顿 → time_period=null
   - 交通 → 白天
   - 娱乐 → 晚上
   - 购物 → 白天
   - 其他分类 → time_period=null
4. 绝对不要编造 08:00、12:00、15:00、19:00 这类「看起来合理」的整点。
5. time_period 只能是 早上/中午/晚上/白天 或 null。

输出格式（必须是对象，items 为数组；哪怕只有 1 笔也用数组）：
{{
  "items": [
    {{
      "amount": number,
      "category": string,
      "sub_category": string 或 null,
      "description": string,
      "bill_time": string（ISO 8601）,
      "has_exact_time": boolean,
      "time_period": string 或 null,
      "is_expense": boolean
    }}
  ]
}}

示例：
输入：今天午饭25，下午3点打车去公司花了18，超市买菜花了62.5
输出：
{{
  "items": [
    {{"amount": 25, "category": "餐饮", "sub_category": null, "description": "午饭", "bill_time": "{today}T00:00:00", "has_exact_time": false, "time_period": "中午", "is_expense": true}},
    {{"amount": 18, "category": "交通", "sub_category": null, "description": "打车去公司", "bill_time": "{today}T15:00:00", "has_exact_time": true, "time_period": null, "is_expense": true}},
    {{"amount": 62.5, "category": "购物", "sub_category": null, "description": "超市买菜", "bill_time": "{today}T00:00:00", "has_exact_time": false, "time_period": "白天", "is_expense": true}}
  ]
}}"""


def infer_time_period(category: str, description: str) -> str | None:
    """用户没说时间时，按分类/事由推断时段；推断不出则 null。"""
    desc = description or ""
    if category == "餐饮":
        if any(k in desc for k in ("早饭", "早餐", "早点", "早茶")):
            return "早上"
        if any(k in desc for k in ("午饭", "午餐", "中饭")):
            return "中午"
        if any(k in desc for k in ("晚饭", "晚餐", "夜宵")):
            return "晚上"
        return None
    if category == "交通":
        return "白天"
    if category == "娱乐":
        return "晚上"
    if category == "购物":
        return "白天"
    return None


def date_only(dt: datetime) -> datetime:
    """去掉时分秒，避免无精确时间时落成假整点。"""
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def normalize_item(
    raw: dict, now: datetime, fallback_desc: str
) -> schemas.AiParseResult | None:
    """校验并规范化单条解析结果；无效金额则丢弃。"""
    amount = raw.get("amount")
    try:
        amount_num = float(amount) if amount is not None else None
    except (TypeError, ValueError):
        amount_num = None
    if amount_num is None or amount_num <= 0:
        return None

    category = str(raw.get("category") or "").strip()
    category = LEGACY_CATEGORY_MAP.get(category, category)
    if category not in ALLOWED_CATEGORIES:
        category = "其他"

    bill_time_raw = raw.get("bill_time")
    try:
        bill_time = datetime.fromisoformat(str(bill_time_raw).replace("Z", "+00:00"))
        if bill_time.tzinfo is not None:
            bill_time = bill_time.replace(tzinfo=None)
    except (TypeError, ValueError):
        bill_time = date_only(now)

    sub = raw.get("sub_category")
    if sub is not None:
        sub = str(sub).strip() or None

    description = str(raw.get("description") or "").strip() or fallback_desc
    is_expense = raw.get("is_expense")
    if not isinstance(is_expense, bool):
        is_expense = True

    has_exact = raw.get("has_exact_time")
    if not isinstance(has_exact, bool):
        has_exact = False

    period_raw = raw.get("time_period")
    time_period: str | None = None
    if period_raw is not None:
        p = str(period_raw).strip()
        if p in ALLOWED_PERIODS:
            time_period = p

    if has_exact:
        time_period = None
    else:
        bill_time = date_only(bill_time)
        if time_period is None:
            time_period = infer_time_period(category, description)

    return schemas.AiParseResult(
        amount=round(amount_num, 2),
        category=category,
        sub_category=sub,
        description=description,
        bill_time=bill_time,
        time_period=time_period,
        has_exact_time=has_exact,
        is_expense=is_expense,
    )


def extract_raw_items(data: dict | list) -> list[dict]:
    """兼容模型偶发返回单对象 / items 数组 / 顶层数组。"""
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if isinstance(items, list):
        return [x for x in items if isinstance(x, dict)]
    if "amount" in data:
        return [data]
    return []


def parse_bill_text(
    text: str,
    *,
    unclear_msg: str = UNCLEAR_AMOUNT_MSG,
) -> schemas.AiParseResponse:
    """文字 → 结构化条目（parse / ocr 共用）。"""
    text = (text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail=unclear_msg)

    now = now_cn_naive()

    try:
        raw = strip_code_fence(
            chat_json(
                [
                    {"role": "system", "content": build_system_prompt(now)},
                    {"role": "user", "content": text},
                ],
                temperature=0.1,
            )
        )
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=unclear_msg)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="AI 解析失败，请稍后再试") from e

    fallback = text if len(text) <= 40 else text[:40] + "…"
    results: list[schemas.AiParseResult] = []
    skipped_income = 0
    for item in extract_raw_items(data):
        flag = item.get("is_expense")
        if isinstance(flag, bool) and not flag:
            skipped_income += 1
            continue
        normalized = normalize_item(item, now, fallback)
        if normalized is not None:
            results.append(normalized)

    if not results:
        if skipped_income > 0:
            raise HTTPException(status_code=400, detail=INCOME_ONLY_MSG)
        raise HTTPException(status_code=400, detail=unclear_msg)

    return schemas.AiParseResponse(items=results)
