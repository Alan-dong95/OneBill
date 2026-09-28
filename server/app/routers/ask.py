"""账单 RAG 问答路由。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..core.rate_limit import user_rate_limit
from ..database import get_db
from ..deps import get_current_user
from ..services.ask import answer_question

router = APIRouter(prefix="/api/v1/ask", tags=["ask"])

# 问答：每用户每分钟最多 20 次
_limit_ask = user_rate_limit(20, 60)


@router.post("", response_model=schemas.AskResponse)
def ask_bills(
    body: schemas.AskRequest,
    db: Session = Depends(get_db),
    openid: str = Depends(_limit_ask),
):
    """
    两步问答：LLM 结构化意图 → aggregate 走 SQL / lookup 走向量检索。
    JSON 解析失败兜底走向量检索。
    """
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="请先输入想问的问题")

    user = get_current_user(db, openid)
    answer = answer_question(db, user.id, question)
    return schemas.AskResponse(answer=answer)
