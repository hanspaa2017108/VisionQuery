"use client";

import { useCallback, useRef, useState } from "react";
import { getVideoUrl, runQuery, uploadVideo } from "@/lib/api";
import type { Detection } from "@/lib/types";
import { useClasses } from "@/hooks/useClasses";
import Header from "@/components/Header";
import VideoUpload from "@/components/VideoUpload";
import QueryControls from "@/components/QueryControls";
import { VideoOverlay } from "@/components/VideoOverlay";
import LiveOverlay from "@/components/LiveOverlay";
import DetectionList from "@/components/DetectionList";
import ErrorDisplay from "@/components/ErrorDisplay";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [videoId, setVideoId] = useState("");
  const [mode, setMode] = useState<"video" | "live">("video");
  const [prompt, setPrompt] = useState("person, knife");
  const [fps, setFps] = useState(1);
  const [conf, setConf] = useState(0.25);
  const [videoDetections, setVideoDetections] = useState<Detection[]>([]);
  const [liveDetections, setLiveDetections] = useState<Detection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { promptClasses, displayClasses, classesBusy } = useClasses(prompt);

  const videoUrl = videoId ? getVideoUrl(videoId) : "";

  const handleUpload = async (file: File) => {
    setError("");
    setBusy(true);
    try {
      const data = await uploadVideo(file);
      setVideoId(data.video_id);
      setVideoDetections([]);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRunQuery = async () => {
    if (mode === "live") return;
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
        classes: promptClasses.length ? promptClasses : undefined,
        fps: Number(fps),
        conf: Number(conf),
      });
      setVideoDetections(Array.isArray(data.detections) ? data.detections : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const seekTo = (t: number) => {
    if (mode !== "video") return;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Number(t) || 0;
    v.play?.();
  };

  const handleLiveDetections = useCallback((next: Detection[]) => {
    setLiveDetections(Array.isArray(next) ? next : []);
  }, []);

  const detections = mode === "live" ? liveDetections : videoDetections;

  return (
    <div className="max-w-[1120px] mx-auto">
      <Header mode={mode} onModeChange={setMode} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div>
          {mode === "video" ? (
            <VideoUpload onUpload={handleUpload} busy={busy} videoId={videoId} />
          ) : (
            <div className="card">
              <div className="font-bold mb-2">Live Webcam</div>
              <div className="text-slate-500 text-sm">
                Live detection is running continuously with current classes/prompt.
              </div>
            </div>
          )}

          <QueryControls
            prompt={prompt}
            onPromptChange={setPrompt}
            displayClasses={displayClasses}
            classesBusy={classesBusy}
            classCount={promptClasses.length}
            fps={fps}
            onFpsChange={setFps}
            conf={conf}
            onConfChange={setConf}
            onRunQuery={handleRunQuery}
            busy={busy}
            mode={mode}
            videoId={videoId}
          />

          <ErrorDisplay error={error || null} onDismiss={() => setError("")} />
        </div>

        <div>
          <div className="card">
            <div className="font-bold mb-2">{mode === "video" ? "Video" : "Live"}</div>
            {mode === "video" ? (
              videoId ? (
                <VideoOverlay
                  ref={videoRef}
                  videoSrc={videoUrl}
                  detections={videoDetections}
                  fps={Number(fps) || 1}
                />
              ) : (
                <div className="text-slate-500">Upload a video to preview it here.</div>
              )
            ) : (
              <LiveOverlay
                classes={promptClasses.length ? promptClasses : displayClasses}
                conf={Number(conf) || 0.25}
                sampleFps={Number(fps) || 1}
                onDetections={handleLiveDetections}
              />
            )}
          </div>

          <DetectionList detections={detections} mode={mode} onSeek={seekTo} />
        </div>
      </div>
    </div>
  );
}
