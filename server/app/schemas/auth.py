"""鉴权 / 用户资料。"""

import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=128)  # 小程序 wx.login() 返回的临时 code


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    openid: str
    nickname: str | None = None
    created_at: datetime.datetime | None = None


class UserUpdate(BaseModel):
    """更新个人资料（目前仅昵称）。"""

    nickname: str = Field(..., min_length=1, max_length=32)


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class DeleteAccountOut(BaseModel):
    """注销账号成功回执。"""

    ok: bool = True
