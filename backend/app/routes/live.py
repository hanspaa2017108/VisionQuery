from __future__ import annotations

import base64
import threading

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings
from app.dependencies import get_model, get_model_lock, get_settings
from app.schemas.requests import LiveDetectRequest
from app.services.inference import parse_prompt, run_yoloworld_live_frame

router = APIRouter()


@router.post("/live/detect")
def live_detect(
    req: LiveDetectRequest,
    model=Depends(get_model),
    lock: threading.Lock = Depends(get_model_lock),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    classes = [c.strip() for c in (req.classes or []) if c and c.strip()]
    if not classes:
        classes = parse_prompt(req.prompt or "", max_classes=settings.MAX_CLASSES)
    if not classes:
        raise HTTPException(status_code=400, detail="Provide `classes` or a non-empty `prompt`")

    raw = req.image_b64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw)
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        frame_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image payload: {e}") from e

    if frame_bgr is None:
        raise HTTPException(status_code=400, detail="Failed to decode image")

    with lock:
        model.set_classes(classes[: settings.MAX_CLASSES])
        detections = run_yoloworld_live_frame(
            frame_bgr=frame_bgr, model=model, conf=req.conf, device=settings.DEVICE
        )

    h, w = frame_bgr.shape[:2]
    return {
        "detections": detections,
        "frame_width": int(w),
        "frame_height": int(h),
        "classes": classes[: settings.MAX_CLASSES],
    }
