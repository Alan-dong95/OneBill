"""意见反馈：文案 / 联系方式 / 截图（落盘后 JSONB 存 URL）。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..core.security import get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..models import Feedback
from ..services.feedback_storage import save_feedback_images

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])

MAX_IMAGES = 3
MAX_CONTENT_LEN = 2000
MAX_CONTACT_LEN = 128


@router.post("", response_model=schemas.FeedbackOut)
def create_feedback(
    body: schemas.FeedbackCreate,
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """提交意见反馈；截图以 data URL 上传，服务端落盘后只存 /uploads/... URL。"""
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="先写两句反馈呗")
    if len(content) > MAX_CONTENT_LEN:
        raise HTTPException(status_code=400, detail=f"反馈最多 {MAX_CONTENT_LEN} 字")

    contact = (body.contact or "").strip()
    if len(contact) > MAX_CONTACT_LEN:
        raise HTTPException(status_code=400, detail="联系方式有点长，精简一下")

    images = body.images or []
    if len(images) > MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"截图最多 {MAX_IMAGES} 张")
    clean_images = [s for s in images if isinstance(s, str) and s.strip()]
    if len(clean_images) > MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"截图最多 {MAX_IMAGES} 张")

    user = get_current_user(db, openid)
    # 落盘；DB 只留相对 URL，避免 JSONB 塞大 base64
    stored_urls = save_feedback_images(user.id, clean_images)

    row = Feedback(
        user_id=user.id,
        content=content,
        contact=contact or None,
        images=stored_urls,
    )
    db.add(row)
    db.commit()
    return schemas.FeedbackOut(ok=True)
