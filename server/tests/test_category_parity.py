"""分类枚举前后端一致性：后端 CATEGORY_ORDER ↔ 小程序 categories.ts。"""

from __future__ import annotations

import re
from pathlib import Path

from app.constants import CATEGORY_ORDER, LEGACY_CATEGORY_MAP

_ROOT = Path(__file__).resolve().parents[2]
_CATEGORIES_TS = _ROOT / "miniprogram" / "utils" / "categories.ts"


def _parse_miniprogram_category_names(src: str) -> list[str]:
    """从 CATEGORIES 数组里按出现顺序抽出 name: '…'。"""
    m = re.search(
        r"export const CATEGORIES[^=]*=\s*\[(.*?)\];",
        src,
        re.DOTALL,
    )
    if not m:
        raise AssertionError("未找到 export const CATEGORIES = [...]")
    block = m.group(1)
    return re.findall(r"name:\s*['\"]([^'\"]+)['\"]", block)


def _parse_miniprogram_legacy_map(src: str) -> dict[str, str]:
    m = re.search(
        r"const LEGACY_CATEGORY_MAP[^=]*=\s*\{(.*?)\};",
        src,
        re.DOTALL,
    )
    if not m:
        return {}
    block = m.group(1)
    pairs = re.findall(
        r"['\"]?([\u4e00-\u9fff\w]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]",
        block,
    )
    return {k: v for k, v in pairs}


class TestCategoryParity:
    def test_category_order_matches_miniprogram(self):
        src = _CATEGORIES_TS.read_text(encoding="utf-8")
        front = _parse_miniprogram_category_names(src)
        assert front == list(CATEGORY_ORDER), (
            f"前后端分类不一致\n后端: {list(CATEGORY_ORDER)}\n前端: {front}"
        )

    def test_legacy_map_matches_miniprogram(self):
        src = _CATEGORIES_TS.read_text(encoding="utf-8")
        front = _parse_miniprogram_legacy_map(src)
        assert front == dict(LEGACY_CATEGORY_MAP), (
            f"legacy 映射不一致\n后端: {LEGACY_CATEGORY_MAP}\n前端: {front}"
        )
