from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile


def sanitize_video_id(video_id: str) -> str:
    safe = "".join(ch for ch in video_id if ch.isalnum() or ch in ("-", "_"))
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid video_id")
    return safe


def video_path(video_id: str, *, storage_dir: Path) -> Path:
    safe = sanitize_video_id(video_id)
    return storage_dir / f"{safe}.mp4"


def video_exists(video_id: str, *, storage_dir: Path) -> Path:
    path = video_path(video_id, storage_dir=storage_dir)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return path


async def save_upload(file: UploadFile, *, storage_dir: Path) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    vid = str(uuid.uuid4())
    out_path = video_path(vid, storage_dir=storage_dir)

    try:
        with out_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)
    finally:
        file.file.close()

    return vid
