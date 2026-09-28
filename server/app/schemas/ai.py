"""AI 解析 / OCR。"""

import datetime

from pydantic import BaseModel, Field


class AiParseRequest(BaseModel):
    """自然语言记账解析入参。"""

    text: str = Field(..., min_length=1, max_length=1000)


class AiOcrRequest(BaseModel):
    """小票/截图 OCR 入参：data URL 或裸 base64。"""

    image: str = Field(..., min_length=32, max_length=5_500_000)


class AiParseResult(BaseModel):
    """单笔记账解析结果（不入库，仅返回前端确认）。"""

    amount: float
    category: str
    sub_category: str | None = None
    description: str
    bill_time: datetime.datetime
    # 早上/中午/晚上/白天；has_exact_time=true 时为 null
    time_period: str | None = None
    # 用户是否说了具体钟点（否则 bill_time 仅作日期，时分置 00:00）
    has_exact_time: bool = False
    is_expense: bool = True


class AiParseResponse(BaseModel):
    """自然语言解析响应：可含多笔账单。"""

    items: list[AiParseResult]
    # OCR 路径会带回抽字结果，便于前端当 raw_text / 文本框回填
    ocr_text: str | None = None
