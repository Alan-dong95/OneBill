"""反馈截图落盘：data URL → /uploads/... URL。"""

from __future__ import annotations

import base64

from app.services.feedback_storage import save_feedback_images


def test_save_feedback_images_writes_file(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.feedback_storage.settings.upload_dir",
        str(tmp_path),
    )
    raw = base64.b64encode(b"fake-jpeg-bytes").decode("ascii")
    data_url = f"data:image/jpeg;base64,{raw}"
    urls = save_feedback_images(42, [data_url])
    assert len(urls) == 1
    assert urls[0].startswith("/uploads/feedback/42/")
    assert urls[0].endswith(".jpg")
    # 去掉 /uploads/ 前缀对应磁盘相对路径
    rel = urls[0][len("/uploads/") :]
    assert (tmp_path / rel).is_file()
    assert (tmp_path / rel).read_bytes() == b"fake-jpeg-bytes"
