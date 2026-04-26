"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { FaceDescriptor, InputMode, VisionEvidence } from "@/lib/types";

const LiveGestureCapture = dynamic(() => import("./LiveGestureCapture"), { ssr: false });
const FaceIdCapture = dynamic(() => import("./FaceIdCapture"), { ssr: false });

const MODES: { id: InputMode; label: string; icon: string; hint: string }[] = [
  { id: "voice",   label: "Voice",         icon: "🎙", hint: "Speak your pitch — browser speech recognition fills it in." },
  { id: "text",    label: "Text",          icon: "⌨",  hint: "Type or paste a written pitch." },
  { id: "symbol",  label: "Symbol board",  icon: "🖼",  hint: "Tap concept tiles to build a structured pitch (AAC-style)." },
  { id: "image",   label: "Image / demo",  icon: "📸", hint: "Upload a screenshot, demo capture, or whiteboard photo. Z.AI GLM-4.5V extracts evidence and flags synthetic images." },
  { id: "gesture", label: "Gesture",       icon: "🤟",  hint: "MediaPipe-driven hand-pose vocabulary (preview)." },
  { id: "gaze",    label: "Eye gaze",      icon: "👁",  hint: "Eye-tracking selection (preview)." },
];

const SYMBOLS: { label: string; phrase: string }[] = [
  { label: "Problem",    phrase: "The problem we solve is " },
  { label: "Who",        phrase: "Our users are " },
  { label: "How",        phrase: "We solve it by " },
  { label: "Built",      phrase: "We have already built " },
  { label: "Open source",phrase: "Our code is open-source at " },
  { label: "Impact",     phrase: "If funded, our next milestone is " },
  { label: "Disability", phrase: "This grant helps me overcome " },
  { label: "Team",       phrase: "Our team is " },
];

export default function ApplyForm() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("text");
  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState("Public goods");
  const [githubUrl, setGithubUrl] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [visionEvidence, setVisionEvidence] = useState<VisionEvidence | null>(null);
  const [analysingImage, setAnalysingImage] = useState(false);
  const [imageSource, setImageSource] = useState<"upload" | "camera" | "screen">("upload");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState<FaceDescriptor | null>(null);
  const [showFaceId, setShowFaceId] = useState(false);

  useEffect(() => () => {
    recRef.current?.stop?.();
    stopStream();
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }

  async function startCamera() {
    setErr(null);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreaming(true);
      setImageSource("camera");
    } catch (e: any) {
      setErr(e?.message ?? "camera access denied");
    }
  }

  async function startScreen() {
    setErr(null);
    stopStream();
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreaming(true);
      setImageSource("screen");
      // user can stop sharing from the browser chrome — sync our state when that happens
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stopStream());
    } catch (e: any) {
      setErr(e?.message ?? "screen capture cancelled");
    }
  }

  async function captureFrame() {
    const v = videoRef.current;
    if (!v || !streamRef.current) return;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setImagePreview(dataUrl);
    await analyseDataUrl(dataUrl, imageSource === "screen" ? "screen" : "camera");
  }

  async function analyseDataUrl(dataUrl: string, source: VisionEvidence["source"]) {
    setAnalysingImage(true);
    try {
      const r = await fetch("/api/vision/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl, source }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.formErrors?.join(", ") ?? "vision call failed");
      const ev: VisionEvidence = data.evidence;
      setVisionEvidence(ev);
      const block = [
        `[vision evidence — ${source}]`,
        ev.description,
        ev.claimsVisible.length ? `claims: ${ev.claimsVisible.join(" · ")}` : "",
        ev.technicalSignals.length ? `tech: ${ev.technicalSignals.join(" · ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      appendPitch(block);
    } catch (e: any) {
      setErr(e?.message ?? "vision analysis failed");
    } finally {
      setAnalysingImage(false);
    }
  }

  function appendPitch(s: string) {
    setPitch((p) => (p ? `${p.replace(/\s+$/, "")} ${s}` : s));
  }

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop?.();
      setListening(false);
      return;
    }
    const SR =
      (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
      (typeof window !== "undefined" && (window as any).webkitSpeechRecognition);
    if (!SR) {
      alert("Browser speech recognition isn't available here. Try Chrome or Edge — or switch to Text / Symbol mode.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i]?.[0]?.transcript;
        if (t) appendPitch(t.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function onImageFile(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Please select an image file.");
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      setErr("Image must be under 7MB.");
      return;
    }
    const dataUrl: string = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
    setImagePreview(dataUrl);
    await analyseDataUrl(dataUrl, "upload");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName,
          category,
          walletAddress: walletAddress || undefined,
          githubUrl,
          pitch,
          inputMode: mode,
          visionEvidence: visionEvidence ?? undefined,
          faceDescriptor: faceDescriptor ?? undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(
          d?.error?.formErrors?.join(", ") ||
          d?.error?.fieldErrors?.[Object.keys(d?.error?.fieldErrors ?? {})[0] ?? ""]?.[0] ||
          "Submission failed"
        );
      }
      const { application } = await r.json();
      router.push(`/a/${application.slug}`);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-white/40">Identity verification (anti-sybil)</div>
          <span className="tag">FaceLandmarker · liveness</span>
        </div>
        <p className="text-xs text-white/50 mb-3">
          Optional but recommended. The same applicant submitting under multiple wallets is one of
          the documented sybil patterns. We extract a small numeric descriptor from your face mesh
          (no photo stored) so the reviewer can detect duplicates across applications.
        </p>
        {!faceDescriptor && !showFaceId && (
          <button type="button" className="btn-ghost text-sm" onClick={() => setShowFaceId(true)}>
            🔒 Verify identity
          </button>
        )}
        {showFaceId && !faceDescriptor && (
          <FaceIdCapture
            onCaptured={(d) => setFaceDescriptor(d)}
            onCleared={() => {
              setFaceDescriptor(null);
              setShowFaceId(false);
            }}
          />
        )}
        {faceDescriptor && (
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-semibold">✓ Identity descriptor captured</div>
              <div className="text-xs text-white/60">
                {faceDescriptor.vector.length} values · liveness: blink ✓ · turn ✓
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                setFaceDescriptor(null);
                setShowFaceId(true);
              }}
            >
              ↻ Re-capture
            </button>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Pitch input mode</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={
                "px-3 py-1.5 rounded-lg text-sm transition border " +
                (mode === m.id
                  ? "bg-accent/20 border-accent text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:border-white/30")
              }
            >
              <span className="mr-1">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/50 mb-4">
          {MODES.find((m) => m.id === mode)?.hint}
        </p>

        {mode === "voice" && (
          <div className="mb-3">
            <button
              type="button"
              className={listening ? "btn" : "btn-ghost"}
              onClick={toggleVoice}
            >
              {listening ? "● recording — click to stop" : "🎙 Start dictating"}
            </button>
          </div>
        )}

        {mode === "symbol" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {SYMBOLS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => appendPitch(s.phrase)}
                className="aspect-square rounded-xl border border-white/10 bg-white/5 hover:bg-accent/10 hover:border-accent/40 transition text-sm font-medium flex items-center justify-center text-center px-2"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {mode === "image" && (
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap gap-1 text-xs">
              {(["upload", "camera", "screen"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s !== "camera" && s !== "screen") stopStream();
                    setImageSource(s);
                  }}
                  className={
                    "px-3 py-1 rounded-md border transition " +
                    (imageSource === s
                      ? "bg-accent/20 border-accent text-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:border-white/30")
                  }
                >
                  {s === "upload" ? "📁 Upload" : s === "camera" ? "📷 Live camera" : "🖥 Screen"}
                </button>
              ))}
            </div>

            {imageSource === "upload" && (
              <label
                className="block rounded-xl border border-dashed border-white/20 bg-white/5 hover:border-accent/40 transition cursor-pointer p-6 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) onImageFile(f);
                }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImageFile(f);
                  }}
                />
                <div className="text-sm text-white/70">
                  {analysingImage
                    ? "🔍 GLM-4.5V analysing image…"
                    : imagePreview
                    ? "Click or drop to replace the image"
                    : "Drop a screenshot / demo image here, or click to select"}
                </div>
                <div className="text-[11px] text-white/40 mt-1">
                  PNG / JPEG / WebP, ≤ 7MB. Sponsor model: Z.AI GLM-4.5V.
                </div>
              </label>
            )}

            {(imageSource === "camera" || imageSource === "screen") && (
              <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                <div className="aspect-video bg-black flex items-center justify-center relative">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={"w-full h-full object-contain " + (streaming ? "" : "hidden")}
                  />
                  {!streaming && (
                    <div className="text-center p-6">
                      <div className="text-sm text-white/70 mb-3">
                        {imageSource === "camera"
                          ? "Live camera capture — face the lens, then snap."
                          : "Capture one frame of any window or browser tab."}
                      </div>
                      <button
                        type="button"
                        className="btn"
                        onClick={imageSource === "camera" ? startCamera : startScreen}
                      >
                        {imageSource === "camera" ? "📷 Start camera" : "🖥 Pick a window"}
                      </button>
                    </div>
                  )}
                  {streaming && (
                    <div className="absolute inset-0 ring-2 ring-accent/50 pointer-events-none rounded-md" />
                  )}
                </div>
                {streaming && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-black/50">
                    <div className="text-[11px] text-white/40">
                      ● live · {imageSource === "camera" ? "user-facing camera" : "screen / window"}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-ghost text-xs" onClick={stopStream}>
                        Stop
                      </button>
                      <button
                        type="button"
                        className="btn text-sm"
                        onClick={captureFrame}
                        disabled={analysingImage}
                      >
                        {analysingImage ? "🔍 Analysing…" : "📸 Capture & analyse"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {imagePreview && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <img
                  src={imagePreview}
                  alt="captured frame"
                  className="rounded-lg border border-white/10 max-h-56 object-contain bg-black/30"
                />
                {visionEvidence && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-accent2">
                      via {visionEvidence.source}
                    </div>
                    <div>
                      <span className="text-white/40 uppercase tracking-wider text-[10px]">Description</span>
                      <div className="text-white/80">{visionEvidence.description}</div>
                    </div>
                    {visionEvidence.claimsVisible.length > 0 && (
                      <div>
                        <span className="text-white/40 uppercase tracking-wider text-[10px]">Claims visible</span>
                        <ul className="list-disc list-inside">
                          {visionEvidence.claimsVisible.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {visionEvidence.syntheticConfidence > 0 && (
                      <div className={visionEvidence.syntheticConfidence >= 0.6 ? "text-warn" : ""}>
                        synthetic confidence: {(visionEvidence.syntheticConfidence * 100).toFixed(0)}%
                        {visionEvidence.syntheticConfidence >= 0.6 ? " ⚠ flagged" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "gesture" && (
          <div className="mb-3">
            <LiveGestureCapture onPhrase={(p) => appendPitch(p)} />
          </div>
        )}

        {mode === "gaze" && (
          <div className="mb-3 rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-xs text-white/60">
            <div className="font-medium text-white/80 mb-1">Eye-gaze preview</div>
            <div>
              The full eye-tracking pipeline runs on MediaPipe FaceLandmarker. For the hackathon
              demo, type into the field below to simulate the selected vocabulary — every other
              layer (scoring, fraud check, attestation) is identical regardless of how the pitch
              is entered.
            </div>
          </div>
        )}

        <textarea
          required
          className="input min-h-[160px] font-mono text-sm"
          placeholder="Your pitch will appear here. Mode-specific helpers above add to it."
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
        />
        <div className="text-[10px] text-white/40 mt-1">
          {pitch.trim().split(/\s+/).filter(Boolean).length} words
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="text-xs uppercase tracking-wider text-white/40">Project</div>
        <Field label="Project name">
          <input required className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. ImpactLens" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Category">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Public goods</option>
              <option>DAO governance</option>
              <option>Climate / DePIN</option>
              <option>Identity / privacy</option>
              <option>Education</option>
              <option>Health</option>
              <option>Open-source infra</option>
            </select>
          </Field>
          <Field label="Wallet (optional, for attestation)">
            <input className="input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x…" />
          </Field>
        </div>
        <Field label="GitHub repo URL">
          <input
            required
            type="url"
            className="input"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
          />
        </Field>
      </div>

      {err && <div className="text-warn text-sm">{err}</div>}

      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>
          {busy ? "Submitting…" : "Submit application →"}
        </button>
        <span className="text-xs text-white/40">
          Next step: GitHub fingerprint + AI scoring + fraud signals.
        </span>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-white/50 mb-1">{label}</div>
      {children}
    </label>
  );
}
