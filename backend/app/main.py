from __future__ import annotations

import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLOWorld

from app.config import Settings
from app.routes import health, live, query, video


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings

    # Ensure video storage directory exists
    Path(settings.STORAGE_DIR).mkdir(parents=True, exist_ok=True)

    # Load YOLO World model
    model = YOLOWorld(settings.MODEL_PATH)
    model.to(settings.DEVICE)
    app.state.model = model

    # Single-flight lock: set_classes() mutates model state,
    # so concurrent inference is not safe. This serializes all
    # inference requests. See TODOS for improvement options.
    app.state.model_lock = threading.Lock()

    yield

    # Cleanup (if needed in future)


app = FastAPI(title="Vision Query", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=Settings().CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(video.router)
app.include_router(query.router)
app.include_router(live.router)
