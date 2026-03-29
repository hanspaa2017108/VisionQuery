import { useEffect, useMemo, useRef, useState } from "react";
import { runLiveDetect } from "../api.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function colorForLabel(label) {
  const s = String(label || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 90% 55%)`;
}

function drawDetections(ctx, detections, canvasW, canvasH, frameW, frameH) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (!frameW || !frameH) return;

  const scale = Math.min(canvasW / frameW, canvasH / frameH);
  const contentW = frameW * scale;
  const contentH = frameH * scale;
  const offX = (canvasW - contentW) / 2;
  const offY = (canvasH - contentH) / 2;
  const sx = contentW / frameW;
  const sy = contentH / frameH;

  for (const det of detections.slice(0, 10)) {
    const bbox = det?.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) continue;
    const [x1, y1, x2, y2] = bbox.map((n) => Number(n));
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    const conf = Number(det?.conf || 0);
    const label = String(det?.label || "object");
    const color = colorForLabel(label);

    const rx1 = offX + x1 * sx;
    const ry1 = offY + y1 * sy;
    const w = Math.max(0, (x2 - x1) * sx);
    const h = Math.max(0, (y2 - y1) * sy);
    if (w < 2 || h < 2) continue;

    ctx.strokeStyle = color;
    ctx.lineWidth = clamp(1.5 + conf * 2.5, 1.5, 4);
    ctx.strokeRect(rx1, ry1, w, h);

    const text = `${label} (${conf.toFixed(2)})`;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const tw = ctx.measureText(text).width;
    const th = 16;
    const bx = rx1;
    const by = Math.max(0, ry1 - th - 2);
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.fillRect(bx, by, tw + 12, th);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, bx + 6, by + 12);
  }
}

export default function LiveOverlay({
  classes,
  prompt,
  conf,
  sampleFps,
  onDetections,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const runningRef = useRef(false);
  const generationRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const [detections, setDetections] = useState([]);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [streamErr, setStreamErr] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);

  const safeFps = useMemo(() => {
    const f = Number(sampleFps);
    if (!Number.isFinite(f) || f <= 0) return 1;
    return f;
  }, [sampleFps]);
  const targetCycleMs = useMemo(
    () => Math.max(120, Math.round(1000 / safeFps)),
    [safeFps]
  );

  function resizeOverlay() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = video.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDetections(ctx, detections, cssW, cssH, frameSize.w, frameSize.h);
  }

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreamErr("");
          setFrameSize({
            w: videoRef.current.videoWidth || 0,
            h: videoRef.current.videoHeight || 0,
          });
          resizeOverlay();
        }
      } catch (e) {
        setStreamErr(e?.message || "Failed to open webcam.");
      }
    })();

    return () => {
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => resizeOverlay();
    const onFull = () => resizeOverlay();
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFull);
    const ro = new ResizeObserver(() => resizeOverlay());
    if (videoRef.current) ro.observe(videoRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFull);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections, frameSize.w, frameSize.h]);

  useEffect(() => {
    runningRef.current = true;
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    let timer;

    async function tick() {
      if (!runningRef.current || myGeneration !== generationRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        timer = setTimeout(tick, 250);
        return;
      }
      if (!classes?.length && !(prompt || "").trim()) {
        timer = setTimeout(tick, 250);
        return;
      }

      setIsDetecting(true);
      const startedAt = Date.now();
      try {
        let cap = captureCanvasRef.current;
        if (!cap) {
          cap = document.createElement("canvas");
          captureCanvasRef.current = cap;
        }
        const srcW = video.videoWidth || 640;
        const srcH = video.videoHeight || 360;
        const maxW = 640; // keep payload/model input small for low-latency live mode
        const scale = Math.min(1, maxW / srcW);
        const w = Math.max(1, Math.round(srcW * scale));
        const h = Math.max(1, Math.round(srcH * scale));
        cap.width = w;
        cap.height = h;
        const cctx = cap.getContext("2d");
        cctx.drawImage(video, 0, 0, w, h);
        const image_b64 = cap.toDataURL("image/jpeg", 0.6);

        const res = await runLiveDetect({
          image_b64,
          prompt,
          classes,
          conf: Number(conf) || 0.25,
        });
        if (myGeneration !== generationRef.current) return;
        const next = Array.isArray(res?.detections) ? res.detections : [];
        setDetections(next);
        setFrameSize({
          w: Number(res?.frame_width) || w,
          h: Number(res?.frame_height) || h,
        });
        lastResultAtRef.current = Date.now();
        onDetections?.(next);
      } catch {
        // ignore one-off detect errors; keep loop alive
        if (myGeneration === generationRef.current) {
          setDetections([]);
          onDetections?.([]);
        }
      } finally {
        setIsDetecting(false);
      }
      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(20, targetCycleMs - elapsed);
      timer = setTimeout(tick, waitMs);
    }

    tick();

    return () => {
      runningRef.current = false;
      if (myGeneration === generationRef.current) generationRef.current += 1;
      if (timer) clearTimeout(timer);
    };
  }, [classes, conf, onDetections, prompt, targetCycleMs]);

  useEffect(() => {
    const id = setInterval(() => {
      const age = Date.now() - lastResultAtRef.current;
      const staleAfterMs = Math.max(450, targetCycleMs * 2);
      if (lastResultAtRef.current > 0 && age > staleAfterMs) {
        setDetections([]);
        onDetections?.([]);
      }
    }, 150);
    return () => clearInterval(id);
  }, [onDetections, targetCycleMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDetections(ctx, detections, cssW, cssH, frameSize.w, frameSize.h);
  }, [detections, frameSize.w, frameSize.h]);

  async function onFullscreen() {
    const el = containerRef.current;
    if (!el?.requestFullscreen) return;
    try {
      await el.requestFullscreen();
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        borderRadius: 10,
        overflow: "hidden",
        background: "#000",
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        controls={false}
        style={{ width: "100%", height: "auto", display: "block", background: "#000" }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
      <button
        type="button"
        onClick={onFullscreen}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(15, 23, 42, 0.65)",
          color: "white",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        Fullscreen
      </button>

      <div
        style={{
          position: "absolute",
          left: 10,
          top: 10,
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(15, 23, 42, 0.65)",
          color: "white",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {streamErr ? "Webcam error" : isDetecting ? "Live detecting..." : "Live ready"}
      </div>
    </div>
  );
}

