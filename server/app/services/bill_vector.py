"""账单向量写入：创建后异步、补写脚本共用。"""

from __future__ import annotations

import logging
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models import Bill
from .embedding import get_embedding

logger = logging.getLogger(__name__)

# BackgroundTasks 失败时轻量重试（指数退避，秒）
_EMBED_MAX_ATTEMPTS = 3
_EMBED_BACKOFF_BASE = 0.6


def vector_literal(embedding: list[float]) -> str:
    """把浮点数组转成 pgvector 字面量，如 [0.1,0.2,...]。"""
    return "[" + ",".join(str(float(x)) for x in embedding) + "]"


def bill_text_for_embedding(bill: Bill) -> str:
    """拼用于 embedding 的文本；含金额，改金额/分类后向量才会变。"""
    amount_part = ""
    try:
        if bill.amount is not None:
            amount_part = f"{float(bill.amount):.2f}元"
    except (TypeError, ValueError):
        amount_part = ""
    parts = [
        bill.category or "",
        amount_part,
        bill.description or "",
        bill.raw_text or "",
    ]
    text_for_emb = " ".join(p.strip() for p in parts if p and p.strip())
    if not text_for_emb:
        text_for_emb = bill.category or "账单"
    return text_for_emb


def save_bill_vector(db: Session, bill: Bill) -> None:
    """根据账单文本生成 embedding 并 upsert 到 bill_vectors。"""
    emb = get_embedding(bill_text_for_embedding(bill))
    vec = vector_literal(emb)
    db.execute(
        text(
            """
            INSERT INTO bill_vectors (bill_id, embedding, updated_at)
            VALUES (:bill_id, CAST(:embedding AS vector), now())
            ON CONFLICT (bill_id) DO UPDATE
            SET embedding = EXCLUDED.embedding,
                updated_at = now()
            """
        ),
        {"bill_id": bill.id, "embedding": vec},
    )
    db.commit()


def embed_bill_by_id(bill_id: int, max_attempts: int = _EMBED_MAX_ATTEMPTS) -> bool:
    """
    独立会话写向量（BackgroundTasks / 补写脚本用）。
    失败按指数退避重试若干次；成功 True，账单不存在或最终失败 False。
    """
    from ..database import SessionLocal

    attempts = max(1, int(max_attempts))
    for attempt in range(1, attempts + 1):
        db = SessionLocal()
        try:
            bill = db.query(Bill).filter(Bill.id == bill_id).first()
            if bill is None:
                logger.warning("补写向量时账单不存在 bill_id=%s", bill_id)
                return False
            save_bill_vector(db, bill)
            return True
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            if attempt < attempts:
                delay = _EMBED_BACKOFF_BASE * (2 ** (attempt - 1))
                logger.warning(
                    "账单向量写入失败，将重试 bill_id=%s attempt=%s/%s delay=%.1fs",
                    bill_id,
                    attempt,
                    attempts,
                    delay,
                )
                time.sleep(delay)
            else:
                logger.exception(
                    "账单向量写入最终失败 bill_id=%s attempts=%s",
                    bill_id,
                    attempts,
                )
                return False
        finally:
            db.close()
    return False
