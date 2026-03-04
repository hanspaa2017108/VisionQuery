import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

function setRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatConf(conf) {
  const c = Number(conf);
  if (!Number.isFinite(c)) return "0.00";
  return c.toFixed(2);
}

function colorForLabel(label) {
  const s = String(label || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 90% 55%)`;
}

function computeContentRect(containerW, containerH, srcW, srcH) {
  if (!containerW || !containerH || !srcW || !srcH) {
    return { x: 0, y: 0, w: containerW, h: containerH, sx: 1, sy: 1 };
  }
  const scale = Math.min(containerW / srcW, containerH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  const x = (containerW - w) / 2;
  const y = (containerH - h) / 2;
  return { x, y, w, h, sx: w / srcW, sy: h / srcH };
}

export const VideoOverlay = forwardRef(function VideoOverlay(
  { videoSrc, detections, fps, style },
  forwardedVideoRef
) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const lastDrawKeyRef = useRef("");

  const [srcSize, setSrcSize] = useState({ w: 0, h: 0 });
  const [canvasCssSize, setCanvasCssSize] = useState({ w: 0, h: 0 });

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const safeFps = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 1;
  const tolerance = Math.max(0.25, 0.75 / safeFps);

  const index = useMemo(() => {
    const m = new Map();
    const list = Array.isArray(detections) ? detections : [];
    for (const det of list) {
      const t = Number(det?.t);
      if (!Number.isFinite(t)) continue;
      const key = Math.round(t * 10); // 100ms buckets
      const arr = m.get(key) || [];
      arr.push(det);
      m.set(key, arr);
    }
    // pre-sort each bucket by confidence desc for cheap top-k later
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => Number(b?.conf || 0) - Number(a?.conf || 0));
      m.set(k, arr);
    }
    return m;
  }, [detections]);

  function resizeCanvasToVideo() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const rect = video.getBoundingClientRect();
    const cssW = Math.max(0, rect.width);
    const cssH = Math.max(0, rect.height);

    setCanvasCssSize({ w: cssW, h: cssH });

    // Backing buffer for crispness (DPR-aware)
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }

  function getActiveDetections(currentTime) {
    const centerKey = Math.round(Number(currentTime) * 10);
    const radius = Math.ceil(tolerance * 10);
    const results = [];
    for (let k = centerKey - radius; k <= centerKey + radius; k++) {
      const arr = index.get(k);
      if (!arr) continue;
      for (const det of arr) results.push(det);
    }
    // filter + top 10 by conf
    const filtered = results.filter((d) => Math.abs(Number(d?.t) - currentTime) <= tolerance);
    filtered.sort((a, b) => Number(b?.conf || 0) - Number(a?.conf || 0));
    return filtered.slice(0, 10);
  }

  function draw() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentTime = Number(video.currentTime) || 0;
    const active = getActiveDetections(currentTime);

    const key = `${Math.round(currentTime * 30)}:${active.length}:${canvasCssSize.w}x${canvasCssSize.h}:${srcSize.w}x${srcSize.h}`;
    if (key === lastDrawKeyRef.current && !playingRef.current) return;
    lastDrawKeyRef.current = key;

    // Clear in device pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw in CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const srcW = srcSize.w || video.videoWidth || 0;
    const srcH = srcSize.h || video.videoHeight || 0;

    const content = computeContentRect(canvasCssSize.w, canvasCssSize.h, srcW, srcH);

    for (const det of active) {
      const bbox = det?.bbox;
      if (!Array.isArray(bbox) || bbox.length !== 4) continue;
      const [x1, y1, x2, y2] = bbox.map((n) => Number(n));
      if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

      const label = String(det?.label ?? "");
      const conf = Number(det?.conf ?? 0);
      const color = colorForLabel(label);

      const rx1 = content.x + x1 * content.sx;
      const ry1 = content.y + y1 * content.sy;
      const rx2 = content.x + x2 * content.sx;
      const ry2 = content.y + y2 * content.sy;

      const w = Math.max(0, rx2 - rx1);
      const h = Math.max(0, ry2 - ry1);
      if (w <= 1 || h <= 1) continue;

      const strokeW = clamp(1.5 + conf * 2.5, 1.5, 4);
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = color;
      ctx.strokeRect(rx1, ry1, w, h);

      const text = `${label} (${formatConf(conf)})`;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const padX = 6;
      const padY = 4;
      const tw = ctx.measureText(text).width;
      const th = 16;

      const bx = rx1;
      const by = Math.max(0, ry1 - th - 2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.fillRect(bx, by, tw + padX * 2, th);

      ctx.fillStyle = "white";
      ctx.fillText(text, bx + padX, by + th - padY);
    }
  }

  function startLoop() {
    if (playingRef.current) return;
    playingRef.current = true;
    const tick = () => {
      if (!playingRef.current) return;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopLoop() {
    playingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    draw(); // one last draw to sync after pause/seek
  }

  async function onFullscreen() {
    const el = containerRef.current;
    if (!el?.requestFullscreen) return;
    try {
      await el.requestFullscreen();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      setSrcSize({ w: video.videoWidth || 0, h: video.videoHeight || 0 });
      resizeCanvasToVideo();
      draw();
    };
    const onPlay = () => startLoop();
    const onPause = () => stopLoop();
    const onSeeked = () => draw();
    const onTimeUpdate = () => {
      // helps when paused but user scrubs
      if (!playingRef.current) draw();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, safeFps, tolerance, index, canvasCssSize.w, canvasCssSize.h, srcSize.w, srcSize.h]);

  useEffect(() => {
    const onResize = () => {
      resizeCanvasToVideo();
      draw();
    };
    const onFullscreenChange = () => {
      resizeCanvasToVideo();
      draw();
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    const roTarget = videoRef.current || containerRef.current;
    let ro;
    if (roTarget && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        resizeCanvasToVideo();
        draw();
      });
      ro.observe(roTarget);
    }

    // initial size
    resizeCanvasToVideo();
    draw();

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, dpr]);

  // keep drawing in sync when detections list changes
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const mergedVideoRef = (el) => {
    videoRef.current = el;
    setRef(forwardedVideoRef, el);
  };

  return (
    <div
      ref={containerRef}
      className="vq-video-overlay"
      style={{
        position: "relative",
        width: "100%",
        borderRadius: 10,
        overflow: "hidden",
        background: "#000",
        ...style,
      }}
    >
      <style>{`
        /* Hide native fullscreen button so wrapper fullscreen is used (canvas stays aligned). */
        .vq-video-overlay video::-webkit-media-controls-fullscreen-button { display: none !important; }
        .vq-video-overlay video::-webkit-media-controls-picture-in-picture-button { display: none !important; }
      `}</style>
      <video
        ref={mergedVideoRef}
        src={videoSrc}
        controls
        controlsList="nofullscreen"
        disablePictureInPicture
        playsInline
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          background: "#000",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
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
    </div>
  );
});

