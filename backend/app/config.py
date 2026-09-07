from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Device for YOLO model inference ("mps", "cuda", "cpu")
    DEVICE: str = "mps"

    # Path to YOLO World model weights (relative to backend working directory)
    MODEL_PATH: str = "yolov8m-worldv2.pt"

    # Directory for uploaded video storage
    STORAGE_DIR: str = "storage/videos"

    # OpenRouter API config (optional — falls back to heuristic parsing if empty)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"

    # Detection limits
    MAX_CLASSES: int = 10
    MAX_SAMPLED_FRAMES: int = 900
    MAX_DETECTIONS: int = 5000

    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}
