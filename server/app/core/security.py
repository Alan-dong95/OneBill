from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from ..config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def create_access_token(openid: str) -> str:
    """签发 JWT，payload 里存 openid。"""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": openid, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_openid(token: str = Depends(oauth2_scheme)) -> str:
    """FastAPI 依赖：从 Bearer token 解出 openid。"""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        openid = payload.get("sub")
        if not openid:
            raise JWTError("missing sub")
        return openid
    except JWTError:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
