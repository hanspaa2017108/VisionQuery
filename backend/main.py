from __future__ import annotations

import shutil
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from ultralytics import YOLOWorld

from inference import parse_prompt, run_yoloworld_query
from llm_classes import prompt_to_classes


ROOT = Path(__file__).resolve().parent
VIDEOS_DIR = ROOT / "storage" / "videos"
ENV_PATH = ROOT / ".env"


class QueryRequest(BaseModel):
    video_id: str = Field(..., min_length=1)
    # If `classes` is provided, prompt can be omitted.
    prompt: str | None = None
    classes: list[str] | None = None
    fps: float = Field(1.0, gt=0)
    conf: float = Field(0.25, ge=0, le=1)


class ClassesRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


def _video_path(video_id: str) -> Path:
    safe = "".join(ch for ch in video_id if ch.isalnum() or ch in ("-", "_"))
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid video_id")
    return VIDEOS_DIR / f"{safe}.mp4"


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    # Load backend/.env (for OPENROUTER_API_KEY, etc.)
    try:
        from dotenv import load_dotenv

        load_dotenv(ENV_PATH)
    except Exception:
        pass

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    app.state.model = YOLOWorld("yolov8m-worldv2.pt")
    app.state.model.to("mps")
    # set_classes() mutates model state; keep single-flight inference for v0.
    app.state.model_lock = threading.Lock()


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    video_id = str(uuid.uuid4())
    out_path = _video_path(video_id)

    try:
        with out_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)
    finally:
        file.file.close()

    return {"video_id": video_id}


@app.get("/video/{video_id}")
def get_video(video_id: str) -> FileResponse:
    path = _video_path(video_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(path, media_type="video/mp4", filename=f"{video_id}.mp4")


@app.post("/query")
def query(req: QueryRequest) -> dict[str, object]:
    path = _video_path(req.video_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    classes = [c.strip() for c in (req.classes or []) if c and c.strip()]
    if not classes:
        classes = parse_prompt(req.prompt or "")

    if not classes:
        raise HTTPException(status_code=400, detail="Provide `classes` or a non-empty `prompt`")

    model = app.state.model
    lock: threading.Lock = app.state.model_lock

    with lock:
        model.set_classes(classes[:10])
        detections = run_yoloworld_query(
            video_path=path,
            model=model,
            classes=classes[:10],
            fps=req.fps,
            conf=req.conf,
        )

    return {"detections": detections}


@app.post("/classes")
async def classes(req: ClassesRequest) -> dict[str, object]:
    classes = await prompt_to_classes(req.prompt)
    return {"classes": classes}

