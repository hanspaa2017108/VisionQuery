# Vision Query — Design Doc

> ChatGPT for Video Surveillance

## Product Vision

Vision Query is a self-hosted, AI-powered video analysis platform that lets users search recorded video footage and live camera feeds using natural language. Type "person in red shirt near loading dock" and get timestamped results with bounding boxes.

**Target users:** Developers, homeowners with CCTV, small warehouse operators — the long tail of surveillance users who will never buy enterprise contracts from Spot AI or Verkada.

**Wedge:** Privacy-first, runs locally on Apple Silicon, open-vocabulary detection (any object, any description), no cloud, no account.

## Architecture

```
┌─────────────────────────┐
│    Next.js Frontend      │
│  (TypeScript + Tailwind) │
│                          │
│  page.tsx ──────────────┼── Components:
│    Header, VideoUpload,  │   VideoOverlay, LiveOverlay
│    QueryControls,        │   DetectionList, ErrorDisplay
│    lib/api.ts ──────────┼── HTTP ────┐
└─────────────────────────┘            │
                                       │
┌─────────────────────────┐            │
│    FastAPI Backend        │◄──────────┘
│                          │
│  app/main.py (lifespan)  │  routes/    services/
│  config.py (settings)    │  health     inference (YOLO)
│  dependencies.py         │  video      llm (OpenRouter)
│  schemas/ (Pydantic)     │  query      video (storage)
│                          │  live
└─────────────────────────┘
```

## API Contracts

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Liveness check |
| `/upload` | POST | Upload video file, returns `video_id` |
| `/video/{id}` | GET | Stream uploaded video |
| `/query` | POST | Run YOLO detection on uploaded video |
| `/classes` | POST | Convert natural language prompt to detection classes |
| `/live/detect` | POST | Run detection on single webcam frame |

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, Ultralytics (YOLO World v2), OpenCV, pydantic-settings
- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, App Router
- **LLM:** OpenRouter (gpt-4o-mini) for prompt-to-classes conversion
- **Inference:** Apple Silicon MPS acceleration (configurable to CUDA/CPU)
- **Storage:** Local filesystem (no database)

## Getting Started

```bash
./setup.sh                    # One-command setup
cd backend && source .venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
# In another terminal:
cd frontend && npm run dev    # Opens at http://localhost:3000
```

## Modes

1. **Video Mode:** Upload an MP4, type a natural language query, get timestamped detections with bounding box overlays. Click any detection to seek to that moment.

2. **Live Mode:** Connect your webcam, set detection classes, get continuous real-time detection with bounding box overlays drawn on a canvas.

## Configuration

All settings via environment variables in `backend/.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEVICE` | `mps` | Inference device (mps/cuda/cpu) |
| `MODEL_PATH` | `yolov8m-worldv2.pt` | YOLO model weights path |
| `OPENROUTER_API_KEY` | (empty) | LLM API key (optional) |
| `MAX_CLASSES` | `10` | Max detection classes per query |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |

## Roadmap

- [ ] RTSP camera input (connect to real IP cameras)
- [ ] Alert/trigger system (webhook on detection conditions)
- [ ] Multi-camera management
- [ ] Search history and saved queries
- [ ] Docker deployment
- [ ] CI/CD with GitHub Actions

## Known Limitations

- Model lock serializes all inference requests (single-threaded inference)
- No upload file size or type validation
- No authentication or rate limiting
- CORS allows all origins (localhost-only expected)
