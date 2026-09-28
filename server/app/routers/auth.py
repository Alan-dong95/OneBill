import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import schemas
from ..config import settings
from ..core.rate_limit import SlidingWindowLimiter
from ..core.security import create_access_token, get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..models import Bill, Feedback, MonthlyReport, RecurringBill, User
from ..services.feedback_storage import delete_user_upload_dir

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger(__name__)

DEFAULT_NICKNAME = "小韭菜"
# 登录按 IP 限流，防刷 code2session
_login_limiter = SlidingWindowLimiter(60, 60)
# 注销按用户限流，防误触连点
_delete_limiter = SlidingWindowLimiter(3, 3600)


def _user_out(user: User) -> schemas.UserOut:
    """出参时昵称空则回落默认，避免前端再判断。"""
    out = schemas.UserOut.model_validate(user)
    if not (out.nickname and out.nickname.strip()):
        out.nickname = DEFAULT_NICKNAME
    return out


@router.post("/login", response_model=schemas.LoginResponse)
async def login(
    body: schemas.LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """小程序 wx.login() 拿到 code，后端换 openid，签发 JWT。"""
    client_host = request.client.host if request.client else "unknown"
    _login_limiter.check(f"login:{client_host}")

    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.wechat_appid,
        "secret": settings.wechat_secret,
        "js_code": body.code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, timeout=10)
    data = resp.json()

    if data.get("errcode") not in (None, 0):
        raise HTTPException(
            status_code=400, detail=f"微信登录失败: {data.get('errmsg')}"
        )

    openid = data.get("openid")
    if not openid:
        raise HTTPException(status_code=400, detail="微信登录失败: 未返回 openid")

    user = db.query(User).filter(User.openid == openid).first()
    if user is None:
        user = User(openid=openid, nickname=DEFAULT_NICKNAME)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not (user.nickname and user.nickname.strip()):
        # 老用户空昵称补默认，写回一次即可
        user.nickname = DEFAULT_NICKNAME
        db.commit()
        db.refresh(user)

    token = create_access_token(openid)
    return schemas.LoginResponse(token=token, user=_user_out(user))


@router.get("/me", response_model=schemas.UserOut)
def get_me(
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """当前登录用户资料（昵称、注册时间等）。"""
    return _user_out(get_current_user(db, openid))


@router.put("/me", response_model=schemas.UserOut)
def update_me(
    body: schemas.UserUpdate,
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """更新昵称；空串视为无效。"""
    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="昵称不能为空")
    if len(nickname) > 32:
        raise HTTPException(status_code=400, detail="昵称最多 32 个字")

    user = get_current_user(db, openid)
    user.nickname = nickname
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.delete("/me", response_model=schemas.DeleteAccountOut)
def delete_me(
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """注销账号：删账单/向量/月报/周期账/反馈及截图，再删用户行。不可恢复。"""
    user = get_current_user(db, openid)
    _delete_limiter.check(f"delete-me:{user.id}")
    uid = user.id

    # 先清向量，避免删账单后留下孤儿 embedding
    try:
        db.execute(
            text(
                "DELETE FROM bill_vectors WHERE bill_id IN "
                "(SELECT id FROM bills WHERE user_id = :uid)"
            ),
            {"uid": uid},
        )
    except Exception:
        # 语句失败后 Session 需 rollback，才能继续删其余表
        logger.exception("注销时清理 bill_vectors 失败 user_id=%s", uid)
        db.rollback()

    db.query(Bill).filter(Bill.user_id == uid).delete(synchronize_session=False)
    db.query(MonthlyReport).filter(MonthlyReport.user_id == uid).delete(
        synchronize_session=False
    )
    db.query(RecurringBill).filter(RecurringBill.user_id == uid).delete(
        synchronize_session=False
    )
    db.query(Feedback).filter(Feedback.user_id == uid).delete(synchronize_session=False)
    # 按 uid 删，避免向量清理失败 rollback 后 user 实例已 detach
    db.query(User).filter(User.id == uid).delete(synchronize_session=False)
    db.commit()

    # 磁盘截图放事务外：DB 已删干净即可；失败只打日志
    try:
        delete_user_upload_dir(uid)
    except Exception:
        logger.exception("注销时清理反馈截图目录失败 user_id=%s", uid)

    return schemas.DeleteAccountOut(ok=True)
