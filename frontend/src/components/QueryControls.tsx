"use client";

interface QueryControlsProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  displayClasses: string[];
  classesBusy: boolean;
  classCount: number;
  fps: number;
  onFpsChange: (fps: number) => void;
  conf: number;
  onConfChange: (conf: number) => void;
  onRunQuery: () => void;
  busy: boolean;
  mode: "video" | "live";
  videoId: string;
}

export default function QueryControls({
  prompt,
  onPromptChange,
  displayClasses,
  classesBusy,
  classCount,
  fps,
  onFpsChange,
  conf,
  onConfChange,
  onRunQuery,
  busy,
  mode,
  videoId,
}: QueryControlsProps) {
  return (
    <div className="card mt-3">
      <div className="font-bold mb-2">Query Controls</div>
      <div className="grid gap-2.5">
        <label className="grid gap-1.5">
          <span className="text-sm">Prompt (free-form or comma-separated)</span>
          <input
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="person, knife"
            disabled={busy}
            className="input-field"
          />
        </label>

        <div className="grid gap-2">
          <div className="flex justify-between items-center gap-2.5">
            <div className="text-[13px] text-slate-700 font-bold">Classes used for detection</div>
            <div className="text-xs text-slate-500">
              {classesBusy ? "Extracting..." : classCount > 0 ? `${classCount} classes` : "fallback"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {displayClasses.map((c, i) => (
              <span key={`${c}-${i}`} className="chip">{c}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <label className="grid gap-1.5">
            <span className="text-sm">Sample FPS</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={fps}
              onChange={(e) => onFpsChange(Number(e.target.value))}
              disabled={busy}
              className="input-field w-[140px]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm">Conf</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={conf}
              onChange={(e) => onConfChange(Number(e.target.value))}
              disabled={busy}
              className="input-field w-[140px]"
            />
          </label>

          <div className="flex items-end">
            <button
              onClick={onRunQuery}
              disabled={mode === "video" ? busy || !videoId : true}
              className="btn-primary"
              title={mode === "live" ? "Live mode auto-runs detection" : ""}
            >
              {mode === "video" ? (busy ? "Working..." : "Run Query") : "Auto Live"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
