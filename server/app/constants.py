"""业务常量：分类、时段等（与小程序 utils/categories 对齐）。"""

# 12 类固定大类；子类不建表，由 LLM 自由产出
CATEGORY_ORDER = [
    "餐饮",
    "交通",
    "购物",
    "居住",
    "娱乐",
    "医疗",
    "教育",
    "人情",
    "旅行",
    "投资",
    "转账",
    "其他",
]
ALLOWED_CATEGORIES = frozenset(CATEGORY_ORDER)

# 历史后端曾用「通讯/数码」；迁移或展示时映射到现行枚举
LEGACY_CATEGORY_MAP = {
    "通讯": "其他",
    "数码": "购物",
}

# 无具体钟点时的时段标签
ALLOWED_PERIODS = frozenset({"早上", "中午", "晚上", "白天"})
