from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置，从 .env / 环境变量读取。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    wechat_appid: str
    wechat_secret: str
    jwt_secret: str
    jwt_expire_days: int = 30

    # 逗号分隔来源；默认 * 方便本地。上线请改为具体域名，如 https://servicewechat.com
    cors_origins: str = "*"

    # 反馈截图等本地上传目录（相对 server/ 工作目录）；挂载为 /uploads
    upload_dir: str = "uploads"

    # ---- 对话 LLM（OpenAI 兼容：硅基流动 / DeepSeek 等）----
    llm_api_key: str = ""
    llm_base_url: str = "https://api.siliconflow.cn/v1"
    llm_model: str = "Qwen/Qwen2.5-7B-Instruct"
    # 旧名兼容：仅配了 DEEPSEEK_API_KEY 时仍可用
    deepseek_api_key: str = ""
    # 上游挂起时避免拖死 worker
    llm_timeout_seconds: float = 30.0

    # ---- 硅基流动 Embedding（RAG 账单问答）----
    siliconflow_api_key: str = ""
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"
    embedding_model: str = "BAAI/bge-m3"
    embedding_timeout_seconds: float = 20.0

    # ---- 视觉 OCR（小票拍照记账）----
    ocr_model: str = "deepseek-ai/DeepSeek-OCR"
    ocr_timeout_seconds: float = 90.0

    def resolve_llm_api_key(self) -> str:
        """优先 LLM_API_KEY，其次旧 DEEPSEEK_API_KEY。"""
        return (self.llm_api_key or self.deepseek_api_key or "").strip()

    def resolve_llm_base_url(self) -> str:
        """有 LLM_API_KEY 走 llm_base_url；仅旧 DeepSeek 密钥时走官方地址。"""
        if self.llm_api_key.strip():
            return self.llm_base_url.rstrip("/")
        if self.deepseek_api_key.strip():
            return "https://api.deepseek.com"
        return self.llm_base_url.rstrip("/")

    def resolve_llm_model(self) -> str:
        """有 LLM_API_KEY 用配置模型；仅旧 DeepSeek 时用 deepseek-chat。"""
        if self.llm_api_key.strip():
            return self.llm_model.strip() or "Qwen/Qwen2.5-7B-Instruct"
        if self.deepseek_api_key.strip():
            return "deepseek-chat"
        return self.llm_model.strip() or "Qwen/Qwen2.5-7B-Instruct"

    def resolve_ocr_api_key(self) -> str:
        """视觉 OCR：优先 SILICONFLOW，其次对话 LLM 密钥（常同源）。"""
        return (self.siliconflow_api_key or self.resolve_llm_api_key()).strip()

    def resolve_ocr_base_url(self) -> str:
        """有独立 SILICONFLOW 密钥时用其 base；否则跟对话 LLM。"""
        if self.siliconflow_api_key.strip():
            return self.siliconflow_base_url.rstrip("/")
        return self.resolve_llm_base_url()

    def resolve_ocr_model(self) -> str:
        return (self.ocr_model or "").strip() or "deepseek-ai/DeepSeek-OCR"

    def resolve_cors_origins(self) -> list[str]:
        """解析 CORS_ORIGINS；空或 * 表示放开。"""
        raw = (self.cors_origins or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
