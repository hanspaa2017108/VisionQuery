"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Detection } from "@/lib/types";
import { runLiveDetect } from "@/lib/api";
import { getDpr, labelColor } from "@/lib/utils";

interface LiveOverlayProps {
  classes: string[];
  conf: number;
  sampleFps: number;
  onDetections: (detections: Detection[]) => void;
}

export default function LiveOverlay({ classes, conf, sampleFps, onDetections }: LiveOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const genRef = useRef(0);
  const activeRef = useRef(true);
  const [status, setStatus] = useState<"starting" | "active" | "error">("starting");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);

  // Stable callback ref to avoid re-triggering the detection loop
  const onDetectionsRef = useRef(onDetections);
  onDetectionsRef.current = onDetections;

  // Start webcam
  useEffect(() => {
    let stream: MediaStream | null = null;
    activeRef.current = true;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current && activeRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {
            // AbortError when play() is interrupted by unmount/remount (React strict mode)
          });
          setStatus("active");
        }
      } catch {
        setStatus("error");
      }
    })();

    return () => {
      activeRef.current = false;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Detection loop
  useEffect(() => {
    if (status !== "active") return;
    if (!classes.length) return;

    const gen = ++genRef.current;
    let stopped = false;
    const targetMs = Math.max(120, Math.round(1000 / (sampleFps || 1)));

    async function loop() {
      while (!stopped && gen === genRef.current) {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        const start = performance.now();

        // Capture frame
        const cap = captureRef.current;
        if (!cap) break;
        const maxW = 640;
        const scale = Math.min(1, maxW / video.videoWidth);
        const cw = Math.round(video.videoWidth * scale);
        const ch = Math.round(video.videoHeight * scale);
        cap.width = cw;
        cap.height = ch;
        const cctx = cap.getContext("2d");
        if (!cctx) break;
        cctx.drawImage(video, 0, 0, cw, ch);
        const b64 = cap.toDataURL("image/jpeg", 0.6).split(",")[1];

        try {
          const data = await runLiveDetect({
            image_b64: b64,
            classes,
            conf,
          });
          if (gen === genRef.current && !stopped) {
            setDetections(data.detections || []);
            setFrameSize({ w: data.frame_width, h: data.frame_height });
            onDetectionsRef.current(data.detections || []);
          }
        } catch {
          // Silently continue on network errors
        }

        const elapsed = performance.now() - start;
        const wait = Math.max(20, targetMs - elapsed);
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    loop();

    return () => {
      stopped = true;
    };
  }, [status, classes, conf, sampleFps]);

  // Draw detections on canvas
  const drawDetections = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const rect = video.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;

    const dpr = getDpr();
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    if (!frameSize || detections.length === 0) return;

    const sx = cw / frameSize.w;
    const sy = ch / frameSize.h;

    for (const d of detections.slice(0, 10)) {
      const [x1, y1, x2, y2] = d.bbox;
      const dx = x1 * sx;
      const dy = y1 * sy;
      const dw = (x2 - x1) * sx;
      const dh = (y2 - y1) * sy;

      const color = labelColor(d.label);
      const lw = 1.5 + d.conf * 2.5;

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.min(lw, 4);
      ctx.strokeRect(dx, dy, dw, dh);

      const text = `${d.label} (${d.conf.toFixed(2)})`;
      ctx.font = "bold 12px system-ui, sans-serif";
      const tm = ctx.measureText(text);
      const th = 16;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(dx, dy - th - 2, tm.width + 8, th + 2);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, dx + 4, dy - 4);
    }
  }, [detections, frameSize]);

  useEffect(() => {
    drawDetections();
  }, [drawDetections]);

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full rounded-lg bg-black"
        style={{ display: "block" }}
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 pointer-events-none rounded-lg"
      />
      <canvas ref={captureRef} className="hidden" />
      <div className="absolute top-2 left-2 px-2 py-1 rounded text-xs text-white bg-black/50">
        {status === "error" ? "Webcam error" : status === "active" ? "Live detecting..." : "Starting..."}
      </div>
    </div>
  );
}
