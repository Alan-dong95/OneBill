"""元数据相关出参。"""

from pydantic import BaseModel, Field


class CategoriesOut(BaseModel):
    """分类枚举：顺序与后端 ALLOWED 一致。"""

    categories: list[str] = Field(..., min_length=1)
    legacy_map: dict[str, str] = Field(default_factory=dict)
