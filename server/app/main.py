import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import ai, ask, auth, bills, budget, feedback, meta, recurring, report, stats, uploads
from app.services.recurring import process_due_recurring_bills
from app.timeutil import CN_TZ
from app.config import settings

logger = logging.getLogger(__name__)

# 占位 / 过短密钥禁止启动，避免生产误用示例值
_WEAK_JWT_SECRETS = {
    "",
    "please-change-me-to-a-long-random-string",
    "secret",
    "changeme",
    "jwt_secret",
}


def _assert_jwt_secret_safe() -> None:
    secret = (settings.jwt_secret or "").strip()
    if secret.lower() in _WEAK_JWT_SECRETS or len(secret) < 32:
        raise RuntimeError(
            "JWT_SECRET 过弱或仍是示例值：请换成至少 32 字符的随机串"
            "（例如 openssl rand -hex 32），并确认线上 .env 未被本机文件覆盖。"
        )


def _seconds_until_next_cn_run(hour: int = 0, minute: int = 10) -> float:
    """距东八区下次定点跑任务的秒数（默认每天 00:10）。"""
    now = datetime.now(CN_TZ)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return max((target - now).total_seconds(), 1.0)


async def _recurring_daily_loop() -> None:
    """每天跑一次周期账单入账；启动后先补跑一次，避免漏日。"""
    # 启动稍等，等连接池就绪
    await asyncio.sleep(3)
    while True:
        try:
            await asyncio.to_thread(process_due_recurring_bills)
        except Exception:
            logger.exception("周期账单定时任务异常")
        await asyncio.sleep(_seconds_until_next_cn_run())


@asynccontextmanager
async def lifespan(app: FastAPI):
    _assert_jwt_secret_safe()
    task = asyncio.create_task(_recurring_daily_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="韭菜保护本 API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.expose_api_docs else None,
    redoc_url="/redoc" if settings.expose_api_docs else None,
    openapi_url="/openapi.json" if settings.expose_api_docs else None,
)

# CORS：.env 的 CORS_ORIGINS；默认 *。多实例时限流/周期任务仍是进程内，见 server/README
_cors_origins = settings.resolve_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bills.router)
app.include_router(ai.router)
app.include_router(report.router)
app.include_router(ask.router)
app.include_router(stats.router)
app.include_router(feedback.router)
app.include_router(budget.router)
app.include_router(recurring.router)
app.include_router(meta.router)
# 反馈截图：须 Bearer，且只能访问本人 feedback/{user_id}/ 目录
app.include_router(uploads.router)


@app.get("/health")
def health():
    return {"status": "ok"}
