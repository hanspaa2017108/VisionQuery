from __future__ import annotations

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    video_id: str = Field(..., min_length=1)
    prompt: str | None = None
    classes: list[str] | None = None
    fps: float = Field(1.0, gt=0)
    conf: float = Field(0.25, ge=0, le=1)


class ClassesRequest(BaseModel):
    prompt: str = Field(..., min_length=1)


class LiveDetectRequest(BaseModel):
    image_b64: str = Field(..., min_length=1)
    prompt: str | None = None
    classes: list[str] | None = None
    conf: float = Field(0.25, ge=0, le=1)
