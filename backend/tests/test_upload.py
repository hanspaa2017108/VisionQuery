import io


def test_upload_returns_video_id(client):
    fake_video = io.BytesIO(b"\x00" * 100)
    r = client.post("/upload", files={"file": ("test.mp4", fake_video, "video/mp4")})
    assert r.status_code == 200
    data = r.json()
    assert "video_id" in data
    assert len(data["video_id"]) > 0


def test_get_video_returns_file(client):
    fake_video = io.BytesIO(b"\x00" * 100)
    upload = client.post("/upload", files={"file": ("test.mp4", fake_video, "video/mp4")})
    video_id = upload.json()["video_id"]

    r = client.get(f"/video/{video_id}")
    assert r.status_code == 200
    assert r.headers["content-type"] == "video/mp4"


def test_get_video_not_found(client):
    r = client.get("/video/nonexistent-id")
    assert r.status_code == 404
