"""账单问答。"""

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    """账单 RAG 问答入参。"""

    question: str = Field(..., min_length=1, max_length=500)


class AskResponse(BaseModel):
    """账单 RAG 问答出参。"""

    answer: str
