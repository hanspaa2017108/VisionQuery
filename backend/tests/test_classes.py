def test_classes_returns_array(client):
    r = client.post("/classes", json={"prompt": "person, car, dog"})
    assert r.status_code == 200
    data = r.json()
    assert "classes" in data
    assert isinstance(data["classes"], list)
    assert len(data["classes"]) > 0


def test_classes_heuristic_fallback(client):
    # Without OPENROUTER_API_KEY, should fall back to comma-split
    r = client.post("/classes", json={"prompt": "person, knife, red helmet"})
    assert r.status_code == 200
    data = r.json()
    assert "person" in data["classes"]
    assert "knife" in data["classes"]
