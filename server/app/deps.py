"""公共依赖：按 openid 取当前用户。"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import User


def get_current_user(db: Session, openid: str) -> User:
    """openid → User；不存在则 401（需重新登录）。"""
    user = db.query(User).filter(User.openid == openid).first()
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在，请重新登录")
    return user
