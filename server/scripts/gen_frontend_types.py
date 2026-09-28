"""
从 FastAPI OpenAPI 生成小程序 TypeScript 类型。

用法（在 server/ 下）:
  python -m scripts.gen_frontend_types

输出: ../miniprogram/types/generated.ts
手工常量（如 REPORT_FALLBACK_HINT）仍放在 types/api.ts。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# 保证可从 server/ 直接跑
_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVER_ROOT))

from app.main import app  # noqa: E402

OUT_PATH = _SERVER_ROOT.parent / "miniprogram" / "types" / "generated.ts"

# OpenAPI schema 名 → 导出的 TS 接口名（只生成前端常用的）
EXPORT_MAP = {
    "BillOut": "Bill",
    "BillListOut": "BillListResp",
    "StatsOverviewResponse": "StatsOverview",
    "StatsCategoryItem": "StatsCategoryItem",
    "StatsTrendItem": "StatsTrendItem",
    "StatsDailyItem": "StatsDailyItem",
    "StatsRankItem": "StatsRankItem",
    "BudgetOut": "BudgetOut",
    "AiParseResult": "AiParseResult",
    "AiParseResponse": "AiParseResponse",
    "MonthlyReportResponse": "MonthlyReportResp",
    "MonthlyStats": "MonthlyStats",
    "CategoryStat": "ReportCategoryStat",
    "TopExpense": "TopExpense",
    "CategoriesOut": "CategoriesOut",
    "AskResponse": "AskResponse",
    "FeedbackOut": "FeedbackOut",
}


def _ts_type(schema: dict, components: dict) -> str:
    if "$ref" in schema:
        ref = schema["$ref"].rsplit("/", 1)[-1]
        return EXPORT_MAP.get(ref, ref)

    if "anyOf" in schema or "oneOf" in schema:
        variants = schema.get("anyOf") or schema.get("oneOf") or []
        parts: list[str] = []
        for s in variants:
            if s.get("type") == "null":
                parts.append("null")
            else:
                parts.append(_ts_type(s, components))
        seen: list[str] = []
        for p in parts:
            if p not in seen:
                seen.append(p)
        return " | ".join(seen) if seen else "unknown"

    t = schema.get("type")
    if t == "null":
        return "null"
    if t == "string":
        return "string"
    if t == "integer" or t == "number":
        return "number"
    if t == "boolean":
        return "boolean"
    if t == "array":
        items = schema.get("items") or {}
        return f"Array<{_ts_type(items, components)}>"
    if t == "object" or "properties" in schema:
        return "Record<string, unknown>"
    if schema.get("additionalProperties") is not None and not schema.get("properties"):
        # dict[str, str] 等
        ap = schema["additionalProperties"]
        if ap is True:
            return "Record<string, unknown>"
        return f"Record<string, {_ts_type(ap, components)}>"
    if t is None and "properties" not in schema:
        return "unknown"
    return "unknown"


def _render_interface(name: str, schema: dict, components: dict) -> str:
    props = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    lines = [f"export interface {name} {{"]
    for key, prop in props.items():
        # 嵌套 $ref 到未导出 schema：展开一层或用 unknown
        optional = "?" if key not in required else ""
        ts = _ts_type(prop, components)
        # datetime 等在前端一律 string（JSON）
        desc = (prop.get("description") or "").strip()
        if desc:
            lines.append(f"  /** {desc} */")
        lines.append(f"  {key}{optional}: {ts};")
    lines.append("}")
    return "\n".join(lines)


def main() -> int:
    openapi = app.openapi()
    components = (openapi.get("components") or {}).get("schemas") or {}

    chunks: list[str] = [
        "/**",
        " * 由 server/scripts/gen_frontend_types.py 从 OpenAPI 生成，请勿手改。",
        " * 重新生成: cd server && python -m scripts.gen_frontend_types",
        " */",
        "",
    ]

    missing: list[str] = []
    for openapi_name, ts_name in EXPORT_MAP.items():
        schema = components.get(openapi_name)
        if not schema:
            missing.append(openapi_name)
            continue
        chunks.append(_render_interface(ts_name, schema, components))
        chunks.append("")

    if missing:
        print("缺少 OpenAPI schemas:", ", ".join(missing), file=sys.stderr)
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    text = "\n".join(chunks).rstrip() + "\n"
    # 去掉可能的非法标识符（防御）
    text = re.sub(r"\n{3,}", "\n\n", text)
    OUT_PATH.write_text(text, encoding="utf-8")
    print(f"wrote {OUT_PATH.relative_to(_SERVER_ROOT.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
