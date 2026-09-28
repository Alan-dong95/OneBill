"""
补写缺失的账单向量。

用法（在 server/ 目录、已激活 venv）:
  python -m scripts.backfill_vectors
  python -m scripts.backfill_vectors --limit 50
  python -m scripts.backfill_vectors --user-id 1
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import text

# 保证以 -m 或直接跑都能找到 app
from app.database import SessionLocal
from app.services.bill_vector import embed_bill_by_id


def list_missing_bill_ids(user_id: int | None, limit: int) -> list[int]:
    db = SessionLocal()
    try:
        sql = """
            SELECT b.id
            FROM bills b
            LEFT JOIN bill_vectors v ON b.id = v.bill_id
            WHERE v.bill_id IS NULL
        """
        params: dict = {"lim": limit}
        if user_id is not None:
            sql += " AND b.user_id = :uid"
            params["uid"] = user_id
        sql += " ORDER BY b.id ASC LIMIT :lim"
        rows = db.execute(text(sql), params).fetchall()
        return [int(r[0]) for r in rows]
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="补写缺失的账单 embedding")
    parser.add_argument("--limit", type=int, default=100, help="最多处理多少笔")
    parser.add_argument("--user-id", type=int, default=None, help="只补指定用户")
    args = parser.parse_args()

    ids = list_missing_bill_ids(args.user_id, args.limit)
    if not ids:
        print("没有缺失向量的账单，收工。")
        return 0

    ok = 0
    fail = 0
    print(f"待补写 {len(ids)} 笔…")
    for bill_id in ids:
        if embed_bill_by_id(bill_id):
            ok += 1
            print(f"  ok bill_id={bill_id}")
        else:
            fail += 1
            print(f"  fail bill_id={bill_id}", file=sys.stderr)

    print(f"完成：成功 {ok}，失败 {fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
