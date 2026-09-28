"""反馈截图落盘：data URL → /uploads/... URL；鉴权解析与注销清目录。"""

from __future__ import annotations

import base64

import pytest
from fastapi import HTTPException

from app.services.feedback_storage import (
    delete_user_upload_dir,
    resolve_owned_upload_file,
    save_feedback_images,
)


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


def test_resolve_owned_upload_file_ok(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.feedback_storage.settings.upload_dir",
        str(tmp_path),
    )
    raw = base64.b64encode(b"x").decode("ascii")
    url = save_feedback_images(7, [f"data:image/png;base64,{raw}"])[0]
    rel = url[len("/uploads/") :]
    full = resolve_owned_upload_file(7, rel)
    assert full.is_file()


def test_resolve_owned_upload_file_rejects_other_user(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.feedback_storage.settings.upload_dir",
        str(tmp_path),
    )
    raw = base64.b64encode(b"x").decode("ascii")
    url = save_feedback_images(7, [f"data:image/jpeg;base64,{raw}"])[0]
    rel = url[len("/uploads/") :]
    with pytest.raises(HTTPException) as ei:
        resolve_owned_upload_file(8, rel)
    assert ei.value.status_code == 403


def test_resolve_owned_upload_file_rejects_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.feedback_storage.settings.upload_dir",
        str(tmp_path),
    )
    with pytest.raises(HTTPException) as ei:
        resolve_owned_upload_file(1, "feedback/1/../../.env")
    assert ei.value.status_code in (403, 404)


def test_delete_user_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.feedback_storage.settings.upload_dir",
        str(tmp_path),
    )
    raw = base64.b64encode(b"x").decode("ascii")
    save_feedback_images(9, [f"data:image/jpeg;base64,{raw}"])
    assert (tmp_path / "feedback" / "9").is_dir()
    delete_user_upload_dir(9)
    assert not (tmp_path / "feedback" / "9").exists()
