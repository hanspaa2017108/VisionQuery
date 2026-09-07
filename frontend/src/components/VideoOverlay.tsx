"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Detection } from "@/lib/types";
import { getDpr, labelColor } from "@/lib/utils";

interface VideoOverlayProps {
  videoSrc: string;
  detections: Detection[];
  fps: number;
}

export const VideoOverlay = forwardRef<HTMLVideoElement, VideoOverlayProps>(
  function VideoOverlay({ videoSrc, detections, fps }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>(0);

    useImperativeHandle(ref, () => videoRef.current!, []);

    // Index detections into 100ms buckets for fast lookup
    const detIndex = useMemo(() => {
      const idx = new Map<number, Detection[]>();
      for (const d of detections) {
        if (d.t == null) continue;
        const key = Math.round((d.t ?? 0) * 10);
        const arr = idx.get(key) || [];
        arr.push(d);
        idx.set(key, arr);
      }
      // Sort each bucket by confidence descending
      for (const arr of idx.values()) {
        arr.sort((a, b) => b.conf - a.conf);
      }
      return idx;
    }, [detections]);

    const tolerance = useMemo(() => Math.max(0.25, 0.75 / (fps || 1)), [fps]);

    const getActive = useCallback(
      (currentTime: number) => {
        const out: Detection[] = [];
        const lo = Math.round((currentTime - tolerance) * 10);
        const hi = Math.round((currentTime + tolerance) * 10);
        for (let k = lo; k <= hi; k++) {
          const bucket = detIndex.get(k);
          if (bucket) {
            for (const d of bucket) {
              if ((d.t ?? 0) >= currentTime - tolerance && (d.t ?? 0) <= currentTime + tolerance) {
                out.push(d);
              }
            }
          }
        }
        out.sort((a, b) => b.conf - a.conf);
        return out.slice(0, 10);
      },
      [detIndex, tolerance]
    );

    const draw = useCallback(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

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

      const active = getActive(video.currentTime);
      if (active.length === 0) return;

      const sx = cw / vw;
      const sy = ch / vh;

      for (const d of active) {
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
    }, [getActive]);

    const animLoop = useCallback(() => {
      draw();
      rafRef.current = requestAnimationFrame(animLoop);
    }, [draw]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const onPlay = () => {
        cancelAnimationFrame(rafRef.current);
        animLoop();
      };
      const onPause = () => cancelAnimationFrame(rafRef.current);
      const onSeeked = () => draw();
      const onLoaded = () => draw();

      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onPause);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("loadedmetadata", onLoaded);

      return () => {
        cancelAnimationFrame(rafRef.current);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onPause);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadedmetadata", onLoaded);
      };
    }, [animLoop, draw]);

    // Redraw when detections change
    useEffect(() => {
      draw();
    }, [detections, draw]);

    return (
      <div ref={wrapRef} className="relative w-full">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          playsInline
          className="w-full rounded-lg"
          style={{ display: "block" }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 pointer-events-none rounded-lg"
        />
      </div>
    );
  }
);
