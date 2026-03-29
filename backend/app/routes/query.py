from __future__ import annotations

import threading
from pathlib import Path

from fastapi import APIRouter, Depends

from app.config import Settings
from app.dependencies import get_model, get_model_lock, get_settings
from app.schemas.requests import ClassesRequest, QueryRequest
from app.services.inference import parse_prompt, run_yoloworld_query
from app.services.llm import prompt_to_classes
from app.services.video import video_exists

router = APIRouter()


@router.post("/query")
def query(
    req: QueryRequest,
    model=Depends(get_model),
    lock: threading.Lock = Depends(get_model_lock),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    storage = Path(settings.STORAGE_DIR)
    path = video_exists(req.video_id, storage_dir=storage)

    classes = [c.strip() for c in (req.classes or []) if c and c.strip()]
    if not classes:
        classes = parse_prompt(req.prompt or "", max_classes=settings.MAX_CLASSES)

    if not classes:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Provide `classes` or a non-empty `prompt`")

    with lock:
        model.set_classes(classes[: settings.MAX_CLASSES])
        detections = run_yoloworld_query(
            video_path=path,
            model=model,
            classes=classes[: settings.MAX_CLASSES],
            fps=req.fps,
            conf=req.conf,
            device=settings.DEVICE,
            max_sampled_frames=settings.MAX_SAMPLED_FRAMES,
            max_detections=settings.MAX_DETECTIONS,
        )

    return {"detections": detections}


@router.post("/classes")
async def classes_endpoint(
    req: ClassesRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    result = await prompt_to_classes(
        req.prompt,
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.OPENROUTER_MODEL,
        max_classes=settings.MAX_CLASSES,
    )
    return {"classes": result}
