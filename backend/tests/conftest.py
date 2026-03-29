from __future__ import annotations

import threading
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.dependencies import get_model, get_model_lock, get_settings
from app.main import app


@pytest.fixture()
def mock_settings(tmp_path: Path) -> Settings:
    storage = tmp_path / "videos"
    storage.mkdir()
    return Settings(
        DEVICE="cpu",
        MODEL_PATH="fake_model.pt",
        STORAGE_DIR=str(storage),
        OPENROUTER_API_KEY="",
        MAX_CLASSES=10,
        MAX_SAMPLED_FRAMES=5,
        MAX_DETECTIONS=100,
    )


@pytest.fixture()
def mock_model() -> MagicMock:
    model = MagicMock()
    model.names = {0: "person", 1: "car"}
    model.predict.return_value = []
    return model


@pytest.fixture()
def client(mock_settings: Settings, mock_model: MagicMock) -> TestClient:
    lock = threading.Lock()

    app.dependency_overrides[get_settings] = lambda: mock_settings
    app.dependency_overrides[get_model] = lambda: mock_model
    app.dependency_overrides[get_model_lock] = lambda: lock

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
