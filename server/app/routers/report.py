"""AI 月度复盘路由。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..core.rate_limit import user_rate_limit
from ..database import get_db
from ..deps import get_current_user
from ..services.report import monthly_report

router = APIRouter(prefix="/api/v1/report", tags=["report"])

# 复盘调 LLM：每用户每分钟最多 10 次（缓存命中也占配额，防刷）
_limit_report = user_rate_limit(10, 60)


@router.post("/monthly", response_model=schemas.MonthlyReportResponse)
def monthly_report_endpoint(
    body: schemas.MonthlyReportRequest,
    db: Session = Depends(get_db),
    openid: str = Depends(_limit_report),
):
    """
    生成本月 AI 复盘：有缓存直接返回；force=true 删缓存重跑 LLM。
    """
    user = get_current_user(db, openid)
    return monthly_report(db, user, body.month, force=body.force)
