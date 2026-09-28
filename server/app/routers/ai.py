"""AI 自然语言记账解析路由。"""

from fastapi import APIRouter, Depends

from .. import schemas
from ..core.rate_limit import user_rate_limit
from ..services.ai_parse import (
    UNCLEAR_OCR_AMOUNT_MSG,
    parse_bill_text,
)
from ..services.llm import get_llm_client, get_llm_model
from ..services.ocr import extract_receipt_text

# 兼容仍从 routers.ai 引用客户端的旧代码
__all__ = ["get_llm_client", "get_llm_model", "router"]

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

# 解析较费 LLM：每用户每分钟最多 30 次
_limit_parse = user_rate_limit(30, 60)
# OCR = 视觉 + 解析，更严一点
_limit_ocr = user_rate_limit(10, 60)


@router.post("/parse", response_model=schemas.AiParseResponse)
def parse_bill_text_endpoint(
    body: schemas.AiParseRequest,
    _openid: str = Depends(_limit_parse),
):
    """
    用 LLM 把自然语言解析成一笔或多笔记账字段，不入库，由前端确认后再创建。
    """
    return parse_bill_text(body.text)


@router.post("/ocr", response_model=schemas.AiParseResponse)
def parse_bill_image(
    body: schemas.AiOcrRequest,
    _openid: str = Depends(_limit_ocr),
):
    """
    小票/截图记账：视觉 OCR 抽字 → 复用文字 parse → 同结构返回确认列表。
    """
    ocr_text = extract_receipt_text(body.image)
    result = parse_bill_text(ocr_text, unclear_msg=UNCLEAR_OCR_AMOUNT_MSG)
    result.ocr_text = ocr_text
    return result
