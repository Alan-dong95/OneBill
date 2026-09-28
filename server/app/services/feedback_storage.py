"""反馈截图落盘：data URL / base64 → 本地文件，JSONB 只存相对 URL。"""

from __future__ import annotations

import base64
import logging
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

from ..config import settings

logger = logging.getLogger(__name__)

_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|jpg|png|webp|gif));base64,(.+)$",
    re.IGNORECASE | re.DOTALL,
)

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def resolve_upload_root() -> Path:
    """上传根目录（相对路径相对 server/ 工作目录）。"""
    root = Path(settings.upload_dir)
    if not root.is_absolute():
        root = Path.cwd() / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _decode_image_payload(raw: str) -> tuple[bytes, str]:
    """解析 data URL 或裸 base64 → (bytes, ext)。"""
    text = (raw or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="截图内容为空")

    m = _DATA_URL_RE.match(text)
    if m:
        mime = m.group(1).lower()
        if mime == "image/jpg":
            mime = "image/jpeg"
        b64 = re.sub(r"\s+", "", m.group(2))
        ext = _EXT_BY_MIME.get(mime, ".jpg")
    else:
        # 兼容裸 base64
        b64 = re.sub(r"\s+", "", text)
        ext = ".jpg"

    try:
        data = base64.b64decode(b64, validate=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail="截图解码失败") from e
    if not data:
        raise HTTPException(status_code=400, detail="截图无效")
    # 约 200KB 原图上限（与 schemas 字符上限大致对齐）
    if len(data) > 220_000:
        raise HTTPException(status_code=400, detail="截图太大，请压缩后再传")
    return data, ext


def save_feedback_images(user_id: int, images: list[str]) -> list[str]:
    """
    把上传的 base64 写成 uploads/feedback/{user_id}/{uuid}.ext，
    返回可挂载的相对 URL 列表（如 /uploads/feedback/1/xxx.jpg）。
    """
    if not images:
        return []

    root = resolve_upload_root()
    dest_dir = root / "feedback" / str(user_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    for raw in images:
        # 已是本站相对路径（重提/兼容）则原样保留
        if isinstance(raw, str) and raw.startswith("/uploads/"):
            urls.append(raw)
            continue
        data, ext = _decode_image_payload(raw)
        name = f"{uuid.uuid4().hex}{ext}"
        path = dest_dir / name
        try:
            path.write_bytes(data)
        except OSError as e:
            logger.exception("反馈截图写入失败 user_id=%s", user_id)
            raise HTTPException(status_code=500, detail="截图保存失败，稍后再试") from e
        # StaticFiles 挂在 /uploads，URL 相对 upload_dir 根
        rel = path.relative_to(root).as_posix()
        urls.append(f"/uploads/{rel}")
    return urls
