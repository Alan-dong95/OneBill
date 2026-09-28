"""对话 LLM 封装：OpenAI 兼容（硅基流动千问 / DeepSeek 等），供解析、复盘、问答共用。"""

from fastapi import HTTPException
from openai import APITimeoutError, BadRequestError, OpenAI

from ..config import settings

# 懒加载，避免导入时强依赖配置
_client: OpenAI | None = None


def get_llm_client() -> OpenAI:
    """OpenAI 兼容客户端，读 .env 的 LLM_*（兼容旧 DEEPSEEK_API_KEY）。"""
    global _client
    if _client is None:
        api_key = settings.resolve_llm_api_key()
        if not api_key:
            raise HTTPException(status_code=500, detail="AI 服务未配置，请联系管理员")
        _client = OpenAI(
            api_key=api_key,
            base_url=settings.resolve_llm_base_url(),
            timeout=settings.llm_timeout_seconds,
        )
    return _client


def get_llm_model() -> str:
    """当前对话模型名（如 Qwen/Qwen2.5-7B-Instruct）。"""
    return settings.resolve_llm_model()


def strip_code_fence(raw: str) -> str:
    """去掉模型偶发包裹的 ```json ... ```。"""
    text = (raw or "").strip()
    if not text.startswith("```"):
        return text
    text = text.strip("`")
    if text.lower().startswith("json"):
        text = text[4:]
    return text.strip()


def chat_json(messages: list[dict], temperature: float = 0.1) -> str:
    """
    调 LLM 拿 JSON 文本。
    优先带 response_format；部分免费模型不支持时降级重试。
    超时 / 其它错误不盲重试，避免多打一枪。
    """
    client = get_llm_client()
    model = get_llm_model()
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=temperature,
        )
    except APITimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail="AI 响应超时，过会儿再试",
        ) from e
    except BadRequestError:
        # 硅基部分免费模型不支持 json_object，去掉后再试
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
            )
        except APITimeoutError as e:
            raise HTTPException(
                status_code=504,
                detail="AI 响应超时，过会儿再试",
            ) from e
    except HTTPException:
        raise
    return (completion.choices[0].message.content or "").strip()


# 旧名兼容（历史 import）
get_deepseek_client = get_llm_client
