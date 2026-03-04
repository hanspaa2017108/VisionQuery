from __future__ import annotations

import json
import os
import re
from typing import Any


MAX_CLASSES = 10


def _heuristic_classes(prompt: str) -> list[str]:
    # Cheap fallback: split by commas and also extract short noun-ish tokens.
    parts = [p.strip() for p in (prompt or "").split(",")]
    parts = [p for p in parts if p]
    if parts:
        return parts[:MAX_CLASSES]

    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9\\- ]{1,32}", prompt or "")
    cleaned: list[str] = []
    for t in tokens:
        t = " ".join(t.strip().split())
        if not t:
            continue
        if len(t) > 40:
            continue
        if t.lower() in {"find", "show", "detect", "where", "is", "are", "the", "a", "an"}:
            continue
        cleaned.append(t)
        if len(cleaned) >= MAX_CLASSES:
            break
    return cleaned


def _normalize_classes(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for it in items:
        if not isinstance(it, str):
            continue
        s = " ".join(it.strip().split())
        if not s:
            continue
        out.append(s)
        if len(out) >= MAX_CLASSES:
            break
    # de-dupe while preserving order
    seen = set()
    deduped: list[str] = []
    for s in out:
        k = s.lower()
        if k in seen:
            continue
        seen.add(k)
        deduped.append(s)
    return deduped[:MAX_CLASSES]


async def prompt_to_classes(prompt: str) -> list[str]:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return _heuristic_classes(prompt)

    url = "https://openrouter.ai/api/v1/chat/completions"

    system = (
        "You convert a user's free-form search prompt into a short list of object classes "
        "for open-vocabulary object detection. Output ONLY valid JSON: an array of 1-10 short strings. "
        "Each string should be a concrete visual object or attributeable object phrase (e.g., 'person', 'knife', "
        "'forklift', 'red helmet'). No explanations, no extra keys."
    )
    user = (
        f"Prompt: {prompt}\n\n"
        "Return JSON array of object classes only."
    )

    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": 120,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        import httpx  # local import so backend can still run without it

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
    except Exception:
        return _heuristic_classes(prompt)

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )

    # Extract JSON array even if the model wraps it.
    content = content.strip()
    if not content:
        return _heuristic_classes(prompt)

    try:
        parsed = json.loads(content)
        classes = _normalize_classes(parsed)
        return classes if classes else _heuristic_classes(prompt)
    except Exception:
        m = re.search(r"(\\[[\\s\\S]*\\])", content)
        if m:
            try:
                parsed = json.loads(m.group(1))
                classes = _normalize_classes(parsed)
                return classes if classes else _heuristic_classes(prompt)
            except Exception:
                return _heuristic_classes(prompt)
        return _heuristic_classes(prompt)

