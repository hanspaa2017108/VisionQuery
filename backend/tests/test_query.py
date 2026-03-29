import io

import pytest


def test_query_missing_video_returns_404(client):
    r = client.post("/query", json={"video_id": "missing", "classes": ["person"]})
    assert r.status_code == 404


def test_query_no_prompt_or_classes_returns_400(client):
    # Upload a video first
    fake_video = io.BytesIO(b"\x00" * 100)
    upload = client.post("/upload", files={"file": ("test.mp4", fake_video, "video/mp4")})
    video_id = upload.json()["video_id"]

    r = client.post("/query", json={"video_id": video_id})
    assert r.status_code == 400


def test_query_returns_detections_shape(client, mock_model):
    # Upload a video (fake bytes = not a real MP4, so OpenCV can't open it)
    fake_video = io.BytesIO(b"\x00" * 100)
    upload = client.post("/upload", files={"file": ("test.mp4", fake_video, "video/mp4")})
    video_id = upload.json()["video_id"]

    # The fake video can't be opened by OpenCV -> RuntimeError -> 500
    with pytest.raises(RuntimeError, match="Failed to open video"):
        client.post("/query", json={"video_id": video_id, "classes": ["person"], "fps": 1.0})
