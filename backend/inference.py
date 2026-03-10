from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2


MAX_PROMPTS = 10
DEFAULT_SAMPLE_FPS = 1.0
MAX_SAMPLED_FRAMES = 900  # cap work to keep v0 responsive
MAX_DETECTIONS = 5000  # cap response size


def parse_prompt(prompt: str) -> list[str]:
    items = [p.strip() for p in (prompt or "").split(",")]
    items = [p for p in items if p]
    return items[:MAX_PROMPTS]


def _safe_video_fps(cap: cv2.VideoCapture) -> float:
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 0 or fps != fps:  # NaN check
        return 30.0
    return fps


def _frame_step(native_fps: float, requested_fps: float) -> int:
    if requested_fps <= 0:
        requested_fps = DEFAULT_SAMPLE_FPS
    if requested_fps >= native_fps:
        return 1
    step = int(round(native_fps / requested_fps))
    return max(step, 1)


def _label_from_names(names: object, cls_i: int) -> str:
    if isinstance(names, dict):
        v = names.get(cls_i)
        return str(v) if v is not None else str(cls_i)
    if isinstance(names, (list, tuple)):
        if 0 <= cls_i < len(names):
            return str(names[cls_i])
        return str(cls_i)
    return str(cls_i)


def _detections_from_results(*, model: Any, results: Any, t: float | None = None) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    if not results:
        return out

    r0 = results[0]
    names = getattr(r0, "names", None) or getattr(model, "names", {})
    boxes = getattr(r0, "boxes", None)
    if boxes is None:
        return out

    for b in boxes:
        xyxy = b.xyxy[0].tolist()
        cls_i = int(b.cls[0])
        label = _label_from_names(names, cls_i)
        score = float(b.conf[0])
        item: dict[str, object] = {
            "label": str(label),
            "conf": float(score),
            "bbox": [float(x) for x in xyxy],
        }
        if t is not None:
            item["t"] = float(t)
        out.append(item)

    return out


def run_yoloworld_live_frame(*, frame_bgr: Any, model: Any, conf: float) -> list[dict[str, object]]:
    results = model.predict(frame_bgr, conf=conf, verbose=False, device="mps")
    return _detections_from_results(model=model, results=results, t=None)


def run_yoloworld_query(
    *,
    video_path: Path,
    model: Any,
    classes: list[str],
    fps: float,
    conf: float,
) -> list[dict[str, object]]:
    if not classes:
        return []

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Failed to open video")

    native_fps = _safe_video_fps(cap)
    step = _frame_step(native_fps, fps)

    sampled = 0
    frame_i = 0
    detections: list[dict[str, object]] = []

    try:
        while sampled < MAX_SAMPLED_FRAMES and len(detections) < MAX_DETECTIONS:
            ok, frame_bgr = cap.read()
            if not ok:
                break

            if frame_i % step != 0:
                frame_i += 1
                continue

            t = frame_i / native_fps
            sampled += 1

            # Ultralytics expects BGR numpy array (OpenCV format) is OK.
            results = model.predict(frame_bgr, conf=conf, verbose=False, device="mps")
            frame_dets = _detections_from_results(model=model, results=results, t=t)
            if frame_dets:
                remaining = MAX_DETECTIONS - len(detections)
                if remaining > 0:
                    detections.extend(frame_dets[:remaining])

            frame_i += 1
    finally:
        cap.release()

    detections.sort(key=lambda d: (float(d["t"]), -float(d["conf"])))
    return detections

