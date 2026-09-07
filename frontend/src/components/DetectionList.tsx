"use client";

import type { Detection } from "@/lib/types";
import { detectionAccent, formatTime } from "@/lib/utils";

interface DetectionListProps {
  detections: Detection[];
  mode: "video" | "live";
  onSeek?: (t: number) => void;
}

export default function DetectionList({ detections, mode, onSeek }: DetectionListProps) {
  return (
    <div className="card mt-3">
      <div className="flex justify-between gap-2 items-center">
        <strong>Detections</strong>
        <span className="text-slate-500">{detections.length} items</span>
      </div>

      <div className="mt-2.5 max-h-[420px] overflow-auto grid gap-2">
        {detections.length === 0 ? (
          <div className="text-slate-500">Run a query to see results.</div>
        ) : (
          detections.map((d, idx) => (
            <button
              key={`${d.t}-${d.label}-${idx}`}
              onClick={() => mode === "video" && d.t != null && onSeek?.(d.t)}
              className="text-left p-2.5 rounded-lg bg-white cursor-pointer"
              style={{
                border: `1px solid ${detectionAccent(d.conf)}40`,
                borderLeft: `4px solid ${detectionAccent(d.conf)}`,
              }}
              title={mode === "video" ? "Click to seek video" : undefined}
            >
              <div className="flex justify-between gap-2">
                <span>
                  <strong>{d.label}</strong> @ {formatTime(d.t ?? 0)}
                </span>
                <span className="text-slate-800 font-semibold">
                  {Number(d.conf).toFixed(2)}
                </span>
              </div>
              <div className="mt-1 text-slate-500 text-xs">
                bbox: [{(d.bbox || []).map((x) => Number(x).toFixed(0)).join(", ")}]
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
