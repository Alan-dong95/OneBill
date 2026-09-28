"""反馈截图鉴权下载：替代公开 StaticFiles，仅本人可取自己的 feedback 目录。"""

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..core.security import get_current_openid
from ..database import get_db
from ..deps import get_current_user
from ..services.feedback_storage import resolve_owned_upload_file

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.get("/{file_path:path}")
def get_upload(
    file_path: str,
    openid: str = Depends(get_current_openid),
    db: Session = Depends(get_db),
):
    """需 Bearer；路径须为 feedback/{当前用户id}/...。"""
    user = get_current_user(db, openid)
    full = resolve_owned_upload_file(user.id, file_path)
    return FileResponse(full)
