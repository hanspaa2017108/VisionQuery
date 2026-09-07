#!/usr/bin/env bash
set -euo pipefail

# Vision Query - Setup Script
# Works on macOS (Apple Silicon / Intel), Linux, and Windows WSL

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- OS / Architecture Detection ----------
OS="$(uname -s)"
ARCH="$(uname -m)"

info "Detected OS: $OS | Arch: $ARCH"

if [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
  info "Apple Silicon / ARM64 detected — MPS acceleration available"
fi

# ---------- Python Check ----------
PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    ver=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    if [[ "$major" -ge 3 && "$minor" -ge 11 ]]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  error "Python 3.11+ is required but not found.
  Install it:
    macOS:   brew install python@3.12
    Ubuntu:  sudo apt install python3.12 python3.12-venv
    WSL:     sudo apt install python3.12 python3.12-venv"
fi

info "Using Python: $($PYTHON --version)"

# ---------- Node.js Check ----------
if ! command -v node &>/dev/null; then
  error "Node.js 20+ is required but not found.
  Install it:
    macOS:   brew install node
    Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
    WSL:     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
fi

NODE_VER=$(node --version | grep -oE '[0-9]+' | head -1)
if [[ "$NODE_VER" -lt 20 ]]; then
  error "Node.js 20+ required, found $(node --version).
  Update: brew upgrade node (macOS) or install from nodesource"
fi

info "Using Node.js: $(node --version)"

# ---------- Backend Setup ----------
info "Setting up backend..."

cd "$SCRIPT_DIR/backend"

if [[ ! -d ".venv" ]]; then
  $PYTHON -m venv .venv
  info "Created Python virtual environment at backend/.venv"
fi

source .venv/bin/activate
pip install -q -r requirements.txt
info "Backend dependencies installed"

# ---------- .env Template ----------
if [[ ! -f ".env" ]]; then
  cat > .env << 'ENVEOF'
# Vision Query Backend Configuration
# Uncomment and set your OpenRouter API key for LLM-powered class extraction
# Without it, the app falls back to heuristic prompt parsing (still works)
# OPENROUTER_API_KEY=sk-or-...

# Device for YOLO inference: "mps" (Apple Silicon), "cuda" (NVIDIA), "cpu"
# DEVICE=mps
ENVEOF
  info "Created backend/.env template — add your OPENROUTER_API_KEY if you have one"
else
  info "backend/.env already exists, skipping"
fi

# ---------- YOLO Weights ----------
if [[ ! -f "yolov8m-worldv2.pt" ]]; then
  info "YOLO weights not found — they will be downloaded automatically on first run (~57MB)"
else
  info "YOLO weights found: yolov8m-worldv2.pt"
fi

deactivate

# ---------- Frontend Setup ----------
info "Setting up frontend..."

cd "$SCRIPT_DIR/frontend"
npm install --silent
info "Frontend dependencies installed"

# ---------- Done ----------
echo ""
info "Setup complete!"
echo ""
echo "  To start the backend:"
echo "    cd backend"
echo "    source .venv/bin/activate"
echo "    python -m uvicorn app.main:app --reload --port 8000"
echo ""
echo "  To start the frontend:"
echo "    cd frontend"
echo "    npm run dev"
echo ""
echo "  Then open http://localhost:3000"
echo ""
