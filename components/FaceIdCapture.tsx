"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceDescriptor } from "@/lib/types";

// Stable landmark indices on MediaPipe FaceLandmarker's 478-point mesh.
// Eye corners, nose tip, mouth corners, jaw points, brows — picked because they
// move little with expression and are easy to triangulate for normalisation.
const STABLE_LANDMARKS = [
  33, 263, // outer eye corners
  133, 362, // inner eye corners
  1, 168,   // nose tip + bridge
  61, 291,  // mouth corners
  17, 199,  // chin / lower lip
  10, 234, 454, 152, // forehead + cheekbones + chin
  105, 334, // brow centres
  127, 356, // jaw outer
  93, 323,  // ears area
];

// For blink detection — Eye Aspect Ratio uses these landmarks.
const RIGHT_EYE = { top: 159, bottom: 145, leftCorner: 33, rightCorner: 133 };
const LEFT_EYE  = { top: 386, bottom: 374, leftCorner: 362, rightCorner: 263 };

type Step = "idle" | "loading" | "align" | "blink" | "turn" | "captured";

type Props = {
  onCaptured: (descriptor: FaceDescriptor) => void;
  onCleared?: () => void;
};

export default function FaceIdCapture({ onCaptured, onCleared }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const blinkStateRef = useRef({ closed: false, count: 0, baseline: 0.3 });
  const yawHistoryRef = useRef<number[]>([]);
  const sweepRef = useRef(0);
  const liveStatsRef = useRef({ ear: 0, yaw: 0 });

  const [step, setStep] = useState<Step>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [blinks, setBlinks] = useState(0);
  const [maxYaw, setMaxYaw] = useState(0);
  const [captured, setCaptured] = useState<FaceDescriptor | null>(null);
  const [faceVisible, setFaceVisible] = useState(false);

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current;
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
    );
    // GPU delegate fails on some Firefox / older Chrome builds. Fall back to CPU
    // before surfacing an error so the demo just works.
    let lm: any;
    try {
      lm = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
      });
    } catch (gpuErr) {
      console.warn("[FaceID] GPU delegate failed, retrying on CPU", gpuErr);
      lm = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
      });
    }
    landmarkerRef.current = lm;
    return lm;
  }

  async function start() {
    setErr(null);
    setStep("loading");
    setBlinks(0);
    setMaxYaw(0);
    blinkStateRef.current = { closed: false, count: 0, baseline: 0.3 };
    yawHistoryRef.current = [];
    liveStatsRef.current = { ear: 0, yaw: 0 };
    try {
      const lm = await ensureLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setStep("align");
      loop(lm);
    } catch (e: any) {
      setStep("idle");
      setErr(e?.message ?? "camera or model failed");
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function reset() {
    stop();
    setStep("idle");
    setCaptured(null);
    onCleared?.();
  }

  function loop(lm: any) {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = v.videoWidth || 720;
    const h = v.videoHeight || 720;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;

    let result: any = null;
    if (v.readyState >= 2) {
      try {
        result = lm.detectForVideo(v, performance.now());
      } catch {}
    }

    drawFrame(ctx, w, h, result);
    rafRef.current = requestAnimationFrame(() => loop(lm));
  }

  function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, result: any) {
    ctx.clearRect(0, 0, w, h);

    // dim the area outside a centered circle (Apple Face ID guide cutout)
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.36;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const face = result?.faceLandmarks?.[0];
    let aligned = false;
    let faceDetected = false;
    if (face) {
      faceDetected = true;
      // sample-based bbox to test alignment
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of face) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const fcx = ((minX + maxX) / 2) * w;
      const fcy = ((minY + maxY) / 2) * h;
      const fr = Math.max((maxX - minX) * w, (maxY - minY) * h) / 2;
      const inside = Math.hypot(fcx - cx, fcy - cy) < radius * 0.5;
      const correctSize = fr > radius * 0.35 && fr < radius * 1.3;
      aligned = inside && correctSize;

      drawFaceMesh(ctx, face, w, h, aligned);

      // Always compute live stats and run liveness checks once a face is seen,
      // even if the user has drifted slightly off-centre. Alignment is only
      // gating the transition out of the "align" step.
      const ear = avgEyeAspectRatio(face);
      const yaw = estimateYaw(face);
      liveStatsRef.current = { ear, yaw };

      if (step === "align" && aligned) {
        setStep("blink");
      }
      if (step === "blink") {
        updateBlink(ear);
        if (blinkStateRef.current.count >= 2) {
          setStep("turn");
          yawHistoryRef.current = [];
        }
      }
      if (step === "turn") {
        yawHistoryRef.current.push(yaw);
        if (yawHistoryRef.current.length > 90) yawHistoryRef.current.shift();
        const peak = Math.max(...yawHistoryRef.current.map(Math.abs));
        setMaxYaw(peak);
        if (peak > 0.12) {
          const descriptor = buildDescriptor(face);
          const desc: FaceDescriptor = {
            vector: descriptor,
            livenessChecks: { blink: true, turn: true },
            capturedAt: Date.now(),
          };
          setCaptured(desc);
          setStep("captured");
          onCaptured(desc);
        }
      }
    } else if (step !== "idle" && step !== "loading" && step !== "captured") {
      setStep("align");
    }

    drawScanSweep(ctx, cx, cy, radius);
    drawRing(ctx, cx, cy, radius);
    setFaceVisible(faceDetected);

    setProgress(progressForStep(step, blinkStateRef.current.count, maxYaw));
  }

  function drawFaceMesh(
    ctx: CanvasRenderingContext2D,
    face: { x: number; y: number; z: number }[],
    w: number,
    h: number,
    aligned: boolean
  ) {
    ctx.fillStyle = aligned ? "rgba(124,92,255,0.85)" : "rgba(34,211,238,0.55)";
    for (let i = 0; i < face.length; i += 3) {
      const p = face[i];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawScanSweep(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
    sweepRef.current = (sweepRef.current + 1) % 90;
    const t = sweepRef.current / 90;
    const y = cy - radius + t * radius * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, y - 18, 0, y + 18);
    grad.addColorStop(0, "rgba(124,92,255,0)");
    grad.addColorStop(0.5, "rgba(124,92,255,0.45)");
    grad.addColorStop(1, "rgba(124,92,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, y - 18, radius * 2, 36);
    ctx.restore();
  }

  function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(245,243,238,0.18)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const p = progressForStep(step, blinkStateRef.current.count, maxYaw);
    if (p > 0) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(124,92,255,0.95)";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
    }
  }

  function updateBlink(ear: number) {
    // Adaptive baseline — track the user's actual open-eye EAR so people with
    // narrower or wider eyes both work. Closed = ear < 65% of running baseline.
    const s = blinkStateRef.current;
    if (ear > s.baseline) s.baseline = ear * 0.6 + s.baseline * 0.4; // raise baseline fast
    else s.baseline = ear * 0.05 + s.baseline * 0.95;                 // decay slowly
    const closedThresh = Math.max(0.12, s.baseline * 0.65);
    const open = ear > closedThresh;
    if (!open && !s.closed) {
      s.closed = true;
    } else if (open && s.closed) {
      s.closed = false;
      s.count++;
      setBlinks(s.count);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-black/50 overflow-hidden">
        <div className="aspect-square bg-black flex items-center justify-center relative max-w-md mx-auto">
          <video
            ref={videoRef}
            playsInline
            muted
            className={"absolute inset-0 w-full h-full object-cover " + (step !== "idle" ? "" : "hidden")}
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className={"absolute inset-0 w-full h-full pointer-events-none " + (step !== "idle" ? "" : "hidden")}
            style={{ transform: "scaleX(-1)" }}
          />

          {step === "idle" && !captured && (
            <div className="text-center p-6 relative z-10">
              <div className="text-sm text-white/70 mb-3">
                Verify your identity. MediaPipe FaceLandmarker tracks 478 points;
                we extract a small numeric descriptor (no photo stored) to detect
                duplicate submissions across wallets.
              </div>
              <button type="button" className="btn" onClick={start}>
                🔒 Start identity verification
              </button>
            </div>
          )}

          {step === "captured" && captured && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-5xl mb-2">✓</div>
                <div className="text-white font-semibold">Identity captured</div>
                <div className="text-xs text-white/60 mt-1">
                  Descriptor: {captured.vector.length} values · liveness verified
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs mt-3"
                  onClick={reset}
                >
                  ↻ Re-capture
                </button>
              </div>
            </div>
          )}

          {step !== "idle" && step !== "captured" && (
            <>
              <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-black/70 text-[11px] font-mono">
                <span className={faceVisible ? "text-accent2" : "text-warn"}>
                  {faceVisible ? "● face detected" : "○ no face detected"}
                </span>
              </div>
              <div className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-black/70 text-[10px] font-mono text-white/70 leading-tight text-right">
                <div>EAR {liveStatsRef.current.ear.toFixed(2)} · base {blinkStateRef.current.baseline.toFixed(2)}</div>
                <div>yaw {(liveStatsRef.current.yaw * 100).toFixed(0)}%</div>
              </div>
              <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none z-10">
                <div className="px-3 py-1.5 rounded-md bg-black/70 backdrop-blur text-xs text-white/90 font-mono">
                  {prompt(step, blinks, maxYaw, faceVisible)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Step done={step !== "idle" && step !== "loading"} label="Align face" />
        <Step done={blinks >= 2 || step === "captured" || step === "turn"} label={`Blink twice (${Math.min(2, blinks)}/2)`} />
        <Step done={step === "captured"} label="Turn head" />
      </div>

      {err && <div className="text-warn text-xs">{err}</div>}
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <div
      className={
        "rounded-md px-2 py-1.5 border text-center " +
        (done ? "bg-accent/20 border-accent text-white" : "bg-white/5 border-white/10 text-white/50")
      }
    >
      {done ? "✓ " : "○ "}
      {label}
    </div>
  );
}

function prompt(step: Step, blinks: number, yaw: number, faceVisible: boolean): string {
  if (step === "loading") return "Loading FaceLandmarker model…";
  if (step === "align") {
    if (!faceVisible) return "Make sure your face is well-lit and visible to the camera";
    return "Center your face inside the circle (any reasonable size)";
  }
  if (step === "blink") return `Blink twice slowly (${blinks}/2)`;
  if (step === "turn") return `Turn your head slightly to one side (${(yaw * 100).toFixed(0)}%)`;
  return "";
}

function progressForStep(step: Step, blinks: number, yaw: number): number {
  if (step === "idle" || step === "loading") return 0;
  if (step === "align") return 0.05;
  if (step === "blink") return 0.1 + (Math.min(2, blinks) / 2) * 0.4;
  if (step === "turn") return 0.55 + Math.min(1, yaw / 0.18) * 0.45;
  return 1;
}

function avgEyeAspectRatio(face: { x: number; y: number }[]): number {
  function ear(eye: typeof RIGHT_EYE) {
    const top = face[eye.top];
    const bottom = face[eye.bottom];
    const lc = face[eye.leftCorner];
    const rc = face[eye.rightCorner];
    if (!top || !bottom || !lc || !rc) return 0.3;
    const v = Math.hypot(top.x - bottom.x, top.y - bottom.y);
    const h = Math.hypot(lc.x - rc.x, lc.y - rc.y);
    return h === 0 ? 0.3 : v / h;
  }
  return (ear(RIGHT_EYE) + ear(LEFT_EYE)) / 2;
}

function estimateYaw(face: { x: number; y: number }[]): number {
  // Eye-corner-based yaw is much more stable than cheekbone-based yaw.
  // Returns signed fraction of inter-eye distance the nose has shifted off-axis.
  const noseTip = face[1];
  const leftEye = face[33];
  const rightEye = face[263];
  if (!noseTip || !leftEye || !rightEye) return 0;
  const mid = (leftEye.x + rightEye.x) / 2;
  const span = Math.abs(rightEye.x - leftEye.x) || 0.0001;
  return (noseTip.x - mid) / span;
}

function buildDescriptor(face: { x: number; y: number; z: number }[]): number[] {
  // Normalise: translate to nose-bridge anchor, scale by inter-eye distance,
  // rotate so eyes are horizontal — produces an orientation-invariant vector.
  const anchor = face[168] || face[1];
  const leftEye = face[33];
  const rightEye = face[263];
  if (!anchor || !leftEye || !rightEye) return [];
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const angle = Math.atan2(dy, dx);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const scale = Math.hypot(dx, dy) || 0.0001;

  const out: number[] = [];
  for (const idx of STABLE_LANDMARKS) {
    const p = face[idx];
    if (!p) continue;
    const tx = (p.x - anchor.x) / scale;
    const ty = (p.y - anchor.y) / scale;
    const tz = ((p.z ?? 0) - (anchor.z ?? 0)) / scale;
    const rx = tx * cos - ty * sin;
    const ry = tx * sin + ty * cos;
    out.push(round4(rx), round4(ry), round4(tz));
  }
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
