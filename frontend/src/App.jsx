import { useEffect, useMemo, useRef, useState } from "react";
import { getVideoUrl, resolveClasses, runQuery, uploadVideo } from "./api.js";
import { VideoOverlay } from "./components/VideoOverlay.jsx";

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export default function App() {
  const videoRef = useRef(null);

  const [file, setFile] = useState(null);
  const [videoId, setVideoId] = useState("");
  const [prompt, setPrompt] = useState("person, knife");
  const [promptClasses, setPromptClasses] = useState(["person", "knife"]);
  const [classesBusy, setClassesBusy] = useState(false);
  const [fps, setFps] = useState(1);
  const [conf, setConf] = useState(0.25);
  const [detections, setDetections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const videoUrl = useMemo(() => (videoId ? getVideoUrl(videoId) : ""), [videoId]);

  useEffect(() => {
    const p = (prompt || "").trim();
    if (!p) {
      setPromptClasses([]);
      return;
    }

    const controller = new AbortController();
    setClassesBusy(true);

    const t = setTimeout(async () => {
      try {
        const data = await resolveClasses(p, { signal: controller.signal });
        const classes = Array.isArray(data?.classes) ? data.classes : [];
        setPromptClasses(classes);
      } catch {
        // If OpenRouter is down/misconfigured, keep UI stable and fall back to empty.
        setPromptClasses([]);
      } finally {
        setClassesBusy(false);
      }
    }, 450);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [prompt]);

  async function onUpload() {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const data = await uploadVideo(file);
      setVideoId(data.video_id);
      setDetections([]);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRunQuery() {
    if (!videoId) {
      setError("Upload a video first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const data = await runQuery({
        video_id: videoId,
        prompt,
        classes: promptClasses?.length ? promptClasses : undefined,
        fps: Number(fps),
        conf: Number(conf),
      });
      setDetections(Array.isArray(data.detections) ? data.detections : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function seekTo(t) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Number(t) || 0;
    v.play?.();
  }

  function detectionAccent(confidence) {
    const c = Number(confidence) || 0;
    if (c >= 0.7) return "#0ea5e9";
    if (c >= 0.4) return "#8b5cf6";
    return "#64748b";
  }

  const shell = {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    minHeight: "100vh",
    padding: 16,
    background: "linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)",
    color: "#0f172a",
  };

  const container = { maxWidth: 1120, margin: "0 auto" };
  const card = {
    padding: 14,
    border: "1px solid #dbe4f2",
    borderRadius: 12,
    background: "#ffffff",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
  };
  const inputStyle = {
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#f8fafc",
    color: "#0f172a",
  };
  const primaryButton = {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #0ea5e9",
    background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  };
  const secondaryButton = {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #94a3b8",
    background: "#f8fafc",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 600,
  };

  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #c7d2fe",
    background: "linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)",
    color: "#1e293b",
    fontSize: 12,
    fontWeight: 600,
  };

  return (
    <div style={shell}>
      <div style={container}>
        <div
          style={{
            ...card,
            marginBottom: 14,
            background: "linear-gradient(120deg, #0f172a 0%, #1d4ed8 50%, #7c3aed 100%)",
            color: "#fff",
            border: "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: 0.2 }}>VisionQuery</h1>
              <p style={{ margin: "6px 0 0", opacity: 0.9 }}>Natural-language search for video surveillance</p>
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.2)", fontSize: 13 }}>
              v0 MVP
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div>
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Upload</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={busy}
                style={inputStyle}
              />
              <button onClick={onUpload} disabled={busy || !file} style={secondaryButton}>
                {busy ? "Working..." : "Upload Video"}
              </button>
              {videoId ? (
                <span style={{ color: "#334155", fontSize: 13 }}>
                  video_id: <code>{videoId}</code>
                </span>
              ) : null}
            </div>
          </div>

            <div style={{ ...card, marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Query Controls</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Prompt (free-form or comma-separated)</span>
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="person, knife"
                  disabled={busy}
                    style={inputStyle}
                />
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "#334155", fontWeight: 700 }}>Classes used for detection</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {classesBusy ? "Extracting…" : promptClasses.length ? `${promptClasses.length} classes` : "fallback"}
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(promptClasses.length ? promptClasses : (prompt || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10)).map(
                    (c, i) => (
                      <span key={`${c}-${i}`} style={chip}>
                        {c}
                      </span>
                    )
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Sample FPS</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={fps}
                    onChange={(e) => setFps(e.target.value)}
                    disabled={busy}
                      style={{ ...inputStyle, width: 140 }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Conf</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={conf}
                    onChange={(e) => setConf(e.target.value)}
                    disabled={busy}
                      style={{ ...inputStyle, width: 140 }}
                  />
                </label>

                <div style={{ display: "flex", alignItems: "end" }}>
                    <button onClick={onRunQuery} disabled={busy || !videoId} style={primaryButton}>
                    {busy ? "Working..." : "Run Query"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px solid #fda4af",
                  background: "#fff1f2",
                  borderRadius: 10,
                  color: "#9f1239",
                }}
              >
              {error}
            </div>
          ) : null}
        </div>

        <div>
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Video</div>
            {videoId ? (
              <VideoOverlay
                ref={videoRef}
                videoSrc={videoUrl}
                detections={detections}
                fps={Number(fps) || 1}
              />
            ) : (
                <div style={{ color: "#64748b" }}>Upload a video to preview it here.</div>
            )}
          </div>

            <div style={{ ...card, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong>Detections</strong>
                <span style={{ color: "#64748b" }}>{detections.length} items</span>
            </div>

            <div style={{ marginTop: 10, maxHeight: 420, overflow: "auto", display: "grid", gap: 8 }}>
              {detections.length === 0 ? (
                  <div style={{ color: "#64748b" }}>Run a query to see results.</div>
              ) : (
                detections.map((d, idx) => (
                  <button
                    key={`${d.t}-${d.label}-${idx}`}
                    onClick={() => seekTo(d.t)}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 8,
                        border: `1px solid ${detectionAccent(d.conf)}40`,
                      background: "white",
                      cursor: "pointer",
                        borderLeft: `4px solid ${detectionAccent(d.conf)}`,
                    }}
                    title="Click to seek video"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span>
                          <strong>{d.label}</strong> @ {formatTime(d.t)}
                        </span>
                        <span style={{ color: "#1e293b", fontWeight: 600 }}>{Number(d.conf).toFixed(2)}</span>
                    </div>
                      <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
                      bbox: [{(d.bbox || []).map((x) => Number(x).toFixed(0)).join(", ")}]
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

