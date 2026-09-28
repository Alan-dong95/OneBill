"""小票/截图 OCR：硅基流动视觉模型抽字，再交给文字 parse。"""

import re

from fastapi import HTTPException
from openai import APITimeoutError, OpenAI

from ..config import settings

# PaddleOCR-VL 偶发夹带位置标记，记账前清掉
_LOC_MARK_RE = re.compile(r"<\|LOC_\d+\|>")
_WHITESPACE_RE = re.compile(r"\s+")

_ocr_client: OpenAI | None = None

# 单张 data URL 上限（约 4MB 原图 base64 后）
MAX_IMAGE_DATA_URL_CHARS = 5_500_000


def get_ocr_client() -> OpenAI:
    """OpenAI 兼容客户端；密钥优先 SILICONFLOW_*。"""
    global _ocr_client
    if _ocr_client is None:
        api_key = settings.resolve_ocr_api_key()
        if not api_key:
            raise HTTPException(status_code=500, detail="OCR 服务未配置，请联系管理员")
        _ocr_client = OpenAI(
            api_key=api_key,
            base_url=settings.resolve_ocr_base_url(),
            timeout=settings.ocr_timeout_seconds,
        )
    return _ocr_client


def normalize_image_data_url(image: str) -> str:
    """校验并规范化 data URL；拒绝过大或非图片。"""
    raw = (image or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="请先拍一张小票或截图")
    if len(raw) > MAX_IMAGE_DATA_URL_CHARS:
        raise HTTPException(status_code=400, detail="图片太大了，换一张清晰小图试试")
    lower = raw[:64].lower()
    if lower.startswith("data:image/") and ";base64," in lower:
        return raw
    # 裸 base64：按 jpeg 兜底
    if re.fullmatch(r"[A-Za-z0-9+/=\s]+", raw[:200] or ""):
        compact = re.sub(r"\s+", "", raw)
        if len(compact) < 32:
            raise HTTPException(status_code=400, detail="图片无效，换一张再试")
        return f"data:image/jpeg;base64,{compact}"
    raise HTTPException(status_code=400, detail="图片格式不对，请用拍照或相册")


def clean_ocr_text(raw: str) -> str:
    """去掉版面/定位标记与多余空白（兼容 Paddle / DeepSeek-OCR）。"""
    text = _LOC_MARK_RE.sub(" ", raw or "")
    # DeepSeek grounding：<|ref|>…<|/ref|><|det|>…<|/det|>
    text = re.sub(r"<\|/?ref\|>", " ", text)
    text = re.sub(r"<\|det\|>\[\[.*?\]\]<\|/det\|>", " ", text)
    text = re.sub(r"<\|/?[^|>]+\|>", " ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def extract_receipt_text(image_data_url: str) -> str:
    """
    调视觉模型只抽文字（不做记账结构化），默认 deepseek-ai/DeepSeek-OCR。
    DeepSeek-OCR 官方任务词：Free OCR. / Convert the document to markdown.
    """
    data_url = normalize_image_data_url(image_data_url)
    client = get_ocr_client()
    model = settings.resolve_ocr_model()
    # DeepSeek-OCR 对任务前缀敏感；其它模型用中文约束亦可
    if "deepseek-ocr" in model.lower():
        ocr_prompt = "<image>\nFree OCR."
    elif "paddleocr" in model.lower():
        ocr_prompt = "OCR: 只输出图中可见文字，不要解释、不要编造。"
    else:
        ocr_prompt = "只输出图中可见文字，不要解释、不要编造。"
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url,
                                "detail": "auto",
                            },
                        },
                        {
                            "type": "text",
                            "text": ocr_prompt,
                        },
                    ],
                }
            ],
            temperature=0.0,
            max_tokens=2048,
        )
    except APITimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail="识图超时，换张更清晰的再试",
        ) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail="识图失败，请稍后再试",
        ) from e

    text = clean_ocr_text(completion.choices[0].message.content or "")
    if not text:
        raise HTTPException(status_code=400, detail="没认出字，换张更清楚的小票试试")
    # 后续文字 parse 有 1000 字上限，这里先截断保主信息
    if len(text) > 1000:
        text = text[:1000]
    return text
