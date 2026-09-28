"""意见反馈。"""

from pydantic import BaseModel, Field, field_validator

# base64 约 4/3 膨胀；单图原始 ≤200KB → 字符串约 ≤280_000
MAX_FEEDBACK_IMAGE_CHARS = 280_000


class FeedbackCreate(BaseModel):
    """意见反馈入参；images 为 data URL / base64（可选，最多 3 张），服务端落盘后存 URL。"""

    content: str = Field(..., min_length=1, max_length=2000)
    contact: str = Field("", max_length=128)
    images: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("images")
    @classmethod
    def _check_image_size(cls, images: list[str]) -> list[str]:
        for i, s in enumerate(images):
            if not isinstance(s, str):
                raise ValueError(f"第 {i + 1} 张截图格式不对")
            if len(s) > MAX_FEEDBACK_IMAGE_CHARS:
                raise ValueError(f"第 {i + 1} 张截图太大，请压缩后再传")
        return images


class FeedbackOut(BaseModel):
    """意见反馈提交成功回执。"""

    ok: bool = True
