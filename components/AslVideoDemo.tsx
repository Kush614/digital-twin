"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_COUNT = 24;
const CONCURRENCY = 4;

type FrameState = {
  index: number;
  t: number; // seconds in source video
  thumb: string;
  status: "pending" | "running" | "done" | "error";
  letter: string | null;
  confidence: number;
  reason?: string;
};

export default function AslVideoDemo() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(FRAME_COUNT);
  const [frames, setFrames] = useState<FrameState[]>([]);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function pickFile(file: File) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setErr(null);
    setFrames([]);
    setTranscript("");
    if (!file.type.startsWith("video/")) {
      setErr("Please select a video file (mp4, webm, mov).");
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  }

  async function loadIncludedDemo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setErr(null);
    setFrames([]);
    setTranscript("");
    try {
      const res = await fetch("/examples/asl-cc-vocabulary.mp4");
      if (!res.ok) throw new Error(`failed to load demo: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (e: any) {
      setErr(e?.message ?? "could not load included demo clip");
    }
  }

  function onLoadedMetadata() {
    const v = videoElRef.current;
    if (!v) return;
    setDuration(isFinite(v.duration) ? v.duration : 0);
  }

  async function extractFrames(): Promise<FrameState[]> {
    const v = videoElRef.current;
    if (!v) throw new Error("video not loaded");
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    const c = document.createElement("canvas");
    const tw = 360;
    c.width = tw;
    c.height = Math.round((tw * h) / w);
    const ctx = c.getContext("2d")!;
    const out: FrameState[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = (dur * (i + 0.5)) / frameCount;
      await seekVideo(v, Math.min(dur - 0.05, t));
      ctx.drawImage(v, 0, 0, c.width, c.height);
      out.push({
        index: i,
        t,
        thumb: c.toDataURL("image/jpeg", 0.78),
        status: "pending",
        letter: null,
        confidence: 0,
      });
    }
    return out;
  }

  async function run() {
    setErr(null);
    setRunning(true);
    setTranscript("");
    try {
      const initial = await extractFrames();
      setFrames(initial);

      // Process in parallel with a concurrency cap.
      const queue = [...initial];
      const workers: Promise<void>[] = [];
      const updateFrame = (idx: number, patch: Partial<FrameState>) =>
        setFrames((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], ...patch } as FrameState;
          return next;
        });

      const work = async () => {
        while (queue.length > 0) {
          const f = queue.shift();
          if (!f) return;
          updateFrame(f.index, { status: "running" });
          try {
            const r = await fetch("/api/asl/recognize", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ imageDataUrl: f.thumb }),
            });
            const data = await r.json();
            const res = data.result;
            updateFrame(f.index, {
              status: "done",
              letter: res?.letter ?? null,
              confidence: typeof res?.confidence === "number" ? res.confidence : 0,
              reason: res?.reason,
            });
          } catch (e: any) {
            updateFrame(f.index, { status: "error", reason: e?.message });
          }
        }
      };
      for (let i = 0; i < CONCURRENCY; i++) workers.push(work());
      await Promise.all(workers);
    } catch (e: any) {
      setErr(e?.message ?? "frame extraction failed");
    } finally {
      setRunning(false);
    }
  }

  // Recompute the transcript whenever frame results change.
  useEffect(() => {
    if (frames.length === 0) {
      setTranscript("");
      return;
    }
    const sorted = [...frames].sort((a, b) => a.index - b.index);
    let out = "";
    let last: string | null = null;
    let lastConf = 0;
    for (const f of sorted) {
      if (!f.letter || f.confidence < 0.55) {
        if (last) {
          // pause/gap → word break
          if (out && !out.endsWith(" ")) out += " ";
          last = null;
          lastConf = 0;
        }
        continue;
      }
      // dedup consecutive same letter; allow re-fire only after a pause
      if (f.letter !== last) {
        out += f.letter;
        last = f.letter;
        lastConf = f.confidence;
      } else if (f.confidence > lastConf + 0.15) {
        // significantly higher confidence on the same letter → keep one, don't double
        lastConf = f.confidence;
      }
    }
    setTranscript(out.replace(/\s+/g, " ").trim());
  }, [frames]);

  const done = frames.filter((f) => f.status === "done").length;
  const total = frames.length;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">1. Source video</div>
        {!videoUrl && (
          <div className="space-y-3">
            <label
              className="block rounded-xl border border-dashed border-white/20 bg-white/5 hover:border-accent/40 transition cursor-pointer p-8 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) pickFile(f);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                }}
              />
              <div className="text-sm text-white/70 mb-1">
                Drop a sign-language video here, or click to select
              </div>
              <div className="text-[11px] text-white/40">
                MP4 / WebM / MOV. Use <span className="font-mono">yt-dlp &lt;youtube-url&gt;</span> to grab a YouTube clip first.
              </div>
            </label>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={loadIncludedDemo}>
                ▶ Use included demo clip
              </button>
              <span className="text-[10px] text-white/40">
                public-domain · 1.4 MB · Center for Accessible Technology in Sign (Internet Archive)
              </span>
            </div>
          </div>
        )}
        {videoUrl && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <video
              ref={videoElRef}
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-lg border border-white/10 bg-black aspect-video object-contain"
              onLoadedMetadata={onLoadedMetadata}
            />
            <div className="space-y-3">
              <div className="text-sm text-white/70">
                Duration: <span className="font-mono">{duration.toFixed(1)}s</span>
              </div>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wider text-white/40">Frames to sample</span>
                <input
                  type="range"
                  min={6}
                  max={48}
                  step={2}
                  value={frameCount}
                  onChange={(e) => setFrameCount(Number(e.target.value))}
                  className="w-full mt-1"
                  disabled={running}
                />
                <span className="text-xs text-white/60">{frameCount} frames · ~1 every {duration > 0 ? (duration / frameCount).toFixed(2) : "?"}s</span>
              </label>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={run}
                  disabled={running}
                >
                  {running ? "Processing…" : "▶ Run ASL detection"}
                </button>
                <button
                  className="btn-ghost text-sm"
                  onClick={() => {
                    if (videoUrl) URL.revokeObjectURL(videoUrl);
                    setVideoUrl(null);
                    setFrames([]);
                    setTranscript("");
                  }}
                  disabled={running}
                >
                  ↻ Replace video
                </button>
              </div>
            </div>
          </div>
        )}
        {err && <div className="text-warn text-sm mt-3">{err}</div>}
      </section>

      {frames.length > 0 && (
        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-white/40">
              2. Per-frame recognition · GLM-4.5V
            </div>
            <div className="text-xs font-mono text-white/60">
              {done}/{total} · {progressPct}%
            </div>
          </div>
          <div className="h-1 rounded-full bg-white/10 mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent2 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
            {frames.map((f) => (
              <FrameTile key={f.index} f={f} />
            ))}
          </div>
        </section>
      )}

      {frames.length > 0 && (
        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-white/40">3. Assembled transcript</div>
            <div className="text-[10px] text-white/40">consecutive same-letter dedup · pauses become spaces</div>
          </div>
          <div
            className="rounded-md bg-black/50 border border-white/10 px-4 py-3 font-mono text-2xl leading-tight min-h-[3rem]"
            style={{ letterSpacing: "0.18em" }}
          >
            {transcript || <span className="text-white/30">…</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="btn-ghost text-xs"
              onClick={() => transcript && navigator.clipboard.writeText(transcript)}
              disabled={!transcript}
            >
              📋 Copy
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function FrameTile({ f }: { f: FrameState }) {
  return (
    <div
      className={
        "relative rounded-md overflow-hidden border transition " +
        (f.status === "running"
          ? "border-accent/60 ring-1 ring-accent animate-pulse"
          : f.status === "done" && f.letter
          ? "border-accent2/60"
          : f.status === "error"
          ? "border-warn/60"
          : "border-white/10 opacity-60")
      }
      title={f.reason ?? ""}
    >
      <img src={f.thumb} alt={`frame ${f.index + 1}`} className="w-full aspect-video object-cover" />
      {f.status === "done" && f.letter && (
        <div
          className="absolute inset-0 flex items-center justify-center text-3xl font-bold"
          style={{
            color: "#f5f3ee",
            textShadow: "0 0 12px rgba(124,92,255,0.95), 0 0 24px rgba(124,92,255,0.5)",
          }}
        >
          {f.letter}
        </div>
      )}
      {f.status === "done" && !f.letter && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">—</div>
      )}
      {f.status === "running" && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-accent2">…</div>
      )}
      <div className="absolute bottom-0 right-0 bg-black/80 text-[9px] font-mono text-white/70 px-1 rounded-tl">
        {f.t.toFixed(1)}s
      </div>
    </div>
  );
}

function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);
      res();
    };
    v.addEventListener("seeked", onSeeked);
    v.currentTime = t;
  });
}
