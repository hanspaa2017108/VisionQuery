import base64


def _make_tiny_image_b64() -> str:
    # 1x1 red PNG
    import struct
    import zlib

    def png_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw_data = b"\x00\xff\x00\x00"  # filter byte + RGB
    idat = png_chunk(b"IDAT", zlib.compress(raw_data))
    iend = png_chunk(b"IEND", b"")
    png_bytes = header + ihdr + idat + iend
    return base64.b64encode(png_bytes).decode()


def test_live_detect_no_classes_returns_400(client):
    b64 = _make_tiny_image_b64()
    r = client.post("/live/detect", json={"image_b64": b64})
    assert r.status_code == 400


def test_live_detect_returns_shape(client, mock_model):
    b64 = _make_tiny_image_b64()
    mock_model.predict.return_value = []

    r = client.post("/live/detect", json={"image_b64": b64, "classes": ["person"]})
    assert r.status_code == 200
    data = r.json()
    assert "detections" in data
    assert "frame_width" in data
    assert "frame_height" in data
    assert "classes" in data


def test_live_detect_invalid_image_returns_400(client):
    r = client.post("/live/detect", json={"image_b64": "not-valid-base64!!!", "classes": ["person"]})
    assert r.status_code == 400
