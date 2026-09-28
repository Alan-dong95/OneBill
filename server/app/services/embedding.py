"""硅基流动 Embedding 封装：账单向量化与问答检索共用。"""

from openai import APITimeoutError, OpenAI

from ..config import settings

# 懒加载客户端，避免导入时强依赖配置
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    """用硅基流动的 OpenAI 兼容接口初始化客户端。"""
    global _client
    if _client is None:
        if not settings.siliconflow_api_key:
            raise RuntimeError("SILICONFLOW_API_KEY 未配置")
        _client = OpenAI(
            api_key=settings.siliconflow_api_key,
            base_url=settings.siliconflow_base_url,
            timeout=settings.embedding_timeout_seconds,
        )
    return _client


def get_embedding(text: str) -> list[float]:
    """
    将文本转为 1024 维向量（BAAI/bge-m3）。
    返回浮点数列表，供写入 bill_vectors 或做相似度检索。
    """
    content = (text or "").strip() or " "
    client = _get_client()
    try:
        resp = client.embeddings.create(
            model=settings.embedding_model,
            input=content,
        )
    except APITimeoutError as e:
        raise TimeoutError("Embedding 请求超时") from e
    return list(resp.data[0].embedding)
