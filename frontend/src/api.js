const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

async function jsonOrThrow(res) {
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.detail || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

export function getVideoUrl(videoId) {
  return `${API_BASE}/video/${encodeURIComponent(videoId)}`;
}

export async function uploadVideo(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: fd,
  });
  return jsonOrThrow(res);
}

export async function resolveClasses(prompt, options = {}) {
  const res = await fetch(`${API_BASE}/classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal: options.signal,
  });
  return jsonOrThrow(res);
}

export async function runQuery({ video_id, prompt, classes, fps, conf }) {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_id, prompt, classes, fps, conf }),
  });
  return jsonOrThrow(res);
}

