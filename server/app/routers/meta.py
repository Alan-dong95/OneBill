"""元数据：分类枚举等（前后端对齐用）。"""

from fastapi import APIRouter

from .. import schemas
from ..constants import CATEGORY_ORDER, LEGACY_CATEGORY_MAP

router = APIRouter(prefix="/api/v1/meta", tags=["meta"])


@router.get("/categories", response_model=schemas.CategoriesOut)
def list_categories():
    """固定 12 类顺序 + 历史分类映射；小程序图标仍在前端维护。"""
    return schemas.CategoriesOut(
        categories=list(CATEGORY_ORDER),
        legacy_map=dict(LEGACY_CATEGORY_MAP),
    )
