"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;          // the verdict / rationale to read aloud
  scoreLabel?: string;   // optional opening line, e.g. "Score 78 of 100."
};

const PUBLIC_APP_ID    = process.env.NEXT_PUBLIC_SPATIALREAL_APP_ID;
const PUBLIC_REGION    = process.env.NEXT_PUBLIC_SPATIALREAL_REGION || "us-west";
const PUBLIC_AVATAR_ID = process.env.NEXT_PUBLIC_SPATIALREAL_AVATAR_ID;

type Status = "idle" | "minting" | "loading-model" | "loading-avatar" | "ready" | "speaking" | "error";

export default function AvatarReader({ text, scoreLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sdkRef = useRef<any>(null);
  const viewRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const configured = Boolean(PUBLIC_APP_ID && PUBLIC_AVATAR_ID);

  useEffect(() => () => {
    teardown();
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel?.();
    }
  }, []);

  function teardown() {
    try {
      viewRef.current?.controller?.close?.();
      viewRef.current?.dispose?.();
    } catch {}
    viewRef.current = null;
  }

  async function start() {
    setErr(null);
    setOpen(true);
    if (!configured) {
      setErr("SpatialReal not configured — set NEXT_PUBLIC_SPATIALREAL_APP_ID + NEXT_PUBLIC_SPATIALREAL_AVATAR_ID in .env.local.");
      setStatus("error");
      return;
    }
    try {
      setStatus("loading-model");
      // Lazy-import the SDK (heavy WebGL/WebGPU bundle). Initialize once per page.
      const sdkMod: any = await import("@spatialwalk/avatarkit");
      const { AvatarSDK, AvatarManager, AvatarView, Environment, DrivingServiceMode } = sdkMod;
      if (!sdkRef.current) {
        await AvatarSDK.initialize(PUBLIC_APP_ID, {
          environment: PUBLIC_REGION === "ap-northeast" ? Environment.cn : Environment.intl,
          drivingServiceMode: DrivingServiceMode.sdk,
        });
        sdkRef.current = AvatarSDK;
      }

      setStatus("minting");
      const tokenRes = await fetch("/api/avatar/session-token", { method: "POST" });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData?.error ?? "session token mint failed");
      AvatarSDK.setSessionToken(tokenData.sessionToken);

      setStatus("loading-avatar");
      const avatar = await AvatarManager.shared.load(PUBLIC_AVATAR_ID);
      const view = new AvatarView(avatar, containerRef.current);
      viewRef.current = view;
      await view.controller.initializeAudioContext();
      await view.controller.start();

      setStatus("ready");
      // Hand off to browser TTS for the spoken narration.
      // The avatar idles with natural micro-motion while audio plays.
      speak(`${scoreLabel ? scoreLabel + " " : ""}${text}`);
    } catch (e: any) {
      setErr(e?.message ?? "avatar init failed");
      setStatus("error");
    }
  }

  function speak(message: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      // No TTS — show as already-narrated, leave avatar idle
      setStatus("ready");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(message);
    u.rate = 1.02;
    u.pitch = 1.0;
    u.onstart = () => setStatus("speaking");
    u.onend = () => setStatus("ready");
    u.onerror = () => setStatus("ready");
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  }

  function stop() {
    window.speechSynthesis?.cancel?.();
    teardown();
    setOpen(false);
    setStatus("idle");
  }

  function replay() {
    speak(`${scoreLabel ? scoreLabel + " " : ""}${text}`);
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-lg font-semibold">Reviewer narrator</h2>
        <span className="tag">SpatialReal · GLM rationale</span>
      </div>
      <p className="text-sm text-white/60 mb-3">
        A SpatialReal digital human reads the LLM's evaluation aloud. Useful for blind reviewers and
        for an at-a-glance "verdict" presentation. Same rationale as the score card above —
        different surface.
      </p>

      {!open ? (
        <button className="btn" onClick={start}>
          🔊 Hear the verdict
        </button>
      ) : (
        <>
          <div
            ref={containerRef}
            className="rounded-xl overflow-hidden border border-white/10 bg-black"
            style={{ width: "100%", height: 360 }}
          />
          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-white/60">
              <StatusPill status={status} configured={configured} />
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={replay} disabled={status === "loading-model" || status === "loading-avatar" || status === "minting"}>
                ↻ Replay
              </button>
              <button className="btn-ghost text-xs" onClick={stop}>
                ⏹ Close
              </button>
            </div>
          </div>
          {err && <div className="mt-2 text-xs text-warn">{err}</div>}
          {!configured && (
            <div className="mt-2 text-[11px] text-white/50">
              Drop these into <code>.env.local</code> and refresh:{" "}
              <code className="font-mono">NEXT_PUBLIC_SPATIALREAL_APP_ID</code>,{" "}
              <code className="font-mono">NEXT_PUBLIC_SPATIALREAL_AVATAR_ID</code>,{" "}
              <code className="font-mono">SPATIALREAL_API_KEY</code>.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusPill({ status, configured }: { status: Status; configured: boolean }) {
  if (!configured) return <span className="text-warn">⚠ SpatialReal not configured</span>;
  const map: Record<Status, { dot: string; label: string }> = {
    idle:            { dot: "bg-white/30",   label: "idle" },
    minting:         { dot: "bg-accent2",    label: "minting session token…" },
    "loading-model": { dot: "bg-accent2",    label: "loading SDK…" },
    "loading-avatar":{ dot: "bg-accent2",    label: "loading avatar…" },
    ready:           { dot: "bg-green-400",  label: "ready (avatar idling)" },
    speaking:        { dot: "bg-accent",     label: "● speaking" },
    error:           { dot: "bg-warn",       label: "error" },
  };
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
