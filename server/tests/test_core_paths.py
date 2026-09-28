"""关键路径单测：分类校验、time_scope、AI normalize、意图解析（不调 LLM）。"""

from datetime import datetime

import pytest
from pydantic import ValidationError

from app.schemas import BillCreate
from app.services.ai_parse import extract_raw_items, infer_time_period, normalize_item
from app.services.ask import parse_time_scope


def _bill_payload(**overrides):
    base = {
        "amount": 12.5,
        "category": "餐饮",
        "description": "午饭",
        "bill_time": datetime(2026, 9, 24, 12, 0, 0),
        "source": "manual",
    }
    base.update(overrides)
    return base


class TestBillCreateCategory:
    def test_accepts_allowed_category(self):
        bill = BillCreate(**_bill_payload(category="交通"))
        assert bill.category == "交通"

    def test_maps_legacy_category(self):
        bill = BillCreate(**_bill_payload(category="数码"))
        assert bill.category == "购物"

    def test_rejects_unknown_category(self):
        with pytest.raises(ValidationError):
            BillCreate(**_bill_payload(category="玄学"))

    def test_rejects_non_positive_amount(self):
        with pytest.raises(ValidationError):
            BillCreate(**_bill_payload(amount=0))


class TestParseTimeScope:
    def test_none_means_all(self):
        start, end, label = parse_time_scope(None)
        assert start is None and end is None and label == "全部"

    def test_year_scope(self):
        start, end, label = parse_time_scope("year_2026")
        assert start is not None and end is not None
        assert label == "2026年"
        assert start.year == 2026 and end.year == 2026

    def test_month_scope(self):
        start, end, label = parse_time_scope("month_2026_09")
        assert start is not None and end is not None
        assert label == "2026-09"
        assert start.month == 9 and end.month == 9

    def test_invalid_falls_back_without_window(self):
        start, end, label = parse_time_scope("上个月")
        assert start is None and end is None
        assert label == "上个月"


class TestAiNormalize:
    def test_infer_meal_period(self):
        assert infer_time_period("餐饮", "午饭") == "中午"
        assert infer_time_period("交通", "地铁") == "白天"

    def test_normalize_drops_invalid_amount(self):
        now = datetime(2026, 9, 24, 15, 0, 0)
        assert normalize_item({"amount": 0, "category": "餐饮"}, now, "x") is None

    def test_normalize_maps_legacy_and_zeros_clock(self):
        now = datetime(2026, 9, 24, 15, 30, 0)
        result = normalize_item(
            {
                "amount": "18.5",
                "category": "通讯",
                "description": "话费",
                "bill_time": "2026-09-24T15:30:00",
                "has_exact_time": False,
                "time_period": None,
            },
            now,
            "fallback",
        )
        assert result is not None
        assert result.category == "其他"
        assert result.amount == 18.5
        assert result.bill_time.hour == 0
        assert result.has_exact_time is False

    def test_extract_items_from_variants(self):
        assert len(extract_raw_items({"items": [{"amount": 1}, "x"]})) == 1
        assert len(extract_raw_items({"amount": 9, "category": "餐饮"})) == 1
        assert extract_raw_items("bad") == []
