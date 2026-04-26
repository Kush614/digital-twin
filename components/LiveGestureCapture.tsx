"use client";

import { useEffect, useRef, useState } from "react";
import { classifyAsl, SUPPORTED_LETTERS, type AslLetter } from "@/lib/asl";

// 7 gesture categories produced by MediaPipe's GestureRecognizer model,
// mapped to pitch-flavoured phrases for ImpactLens.
const GESTURE_VOCAB: Record<string, string> = {
  Thumb_Up:     "I endorse this approach.",
  Thumb_Down:   "This is the problem we hit.",
  Open_Palm:    "We have built and shipped.",
  Closed_Fist:  "We are committed.",
  Pointing_Up:  "Our next milestone is",
  Victory:      "We have two key wins:",
  ILoveYou:     "This is for the community.",
};

const GESTURE_LABELS: Record<string, string> = {
  Thumb_Up:     "👍 Endorse",
  Thumb_Down:   "👎 Problem",
  Open_Palm:    "✋ Built",
  Closed_Fist:  "✊ Committed",
  Pointing_Up:  "☝ Milestone",
  Victory:      "✌ Two wins",
  ILoveYou:     "🤟 Community",
  None:         "",
};

// MediaPipe Hands → 21 landmarks per hand. Connection pairs for skeleton drawing.
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const FINGER_TIPS = [4, 8, 12, 16, 20];

type FloatingLabel = {
  id: number;
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
};

type Props = {
  onPhrase: (phrase: string) => void;
};

export default function LiveGestureCapture({ onPhrase }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognizerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFireRef = useRef<{ name: string; at: number } | null>(null);
  const labelsRef = useRef<FloatingLabel[]>([]);
  const labelIdRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currentGesture, setCurrentGesture] = useState<string>("None");
  const [confidence, setConfidence] = useState<number>(0);
  const [recognized, setRecognized] = useState<{ name: string; phrase: string; at: number }[]>([]);

  // ASL fingerspelling state
  const [aslMode, setAslMode] = useState(false);
  const aslModeRef = useRef(false);
  useEffect(() => { aslModeRef.current = aslMode; }, [aslMode]);
  const [aslLetter, setAslLetter] = useState<AslLetter | null>(null);
  const [aslConfidence, setAslConfidence] = useState(0);
  const [aslBuffer, setAslBuffer] = useState("");
  const aslHoldRef = useRef<{ letter: AslLetter | null; since: number; commitedAt: number; lastSeen: number }>({
    letter: null,
    since: 0,
    commitedAt: 0,
    lastSeen: 0,
  });

  useEffect(() => {
    // Same MediaPipe stderr-routing noise filter as FaceIdCapture.
    const orig = console.error;
    console.error = (...args: any[]) => {
      const first = args[0];
      if (typeof first === "string" && /^(INFO:|W\d+|I\d+|TFLite)/i.test(first)) return;
      orig.apply(console, args);
    };
    return () => {
      console.error = orig;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureRecognizer() {
    if (recognizerRef.current) return recognizerRef.current;
    setLoading(true);
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
      );
      const recognizer = await vision.GestureRecognizer.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU",
        },
        numHands: 2,
        runningMode: "VIDEO",
      });
      recognizerRef.current = recognizer;
      return recognizer;
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    setErr(null);
    try {
      const recognizer = await ensureRecognizer();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setRunning(true);
      loop(recognizer);
    } catch (e: any) {
      setErr(e?.message ?? "camera or model failed");
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setCurrentGesture("None");
    setConfidence(0);
  }

  function loop(recognizer: any) {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // size canvas to video each frame (handles devicePixelRatio + resize)
    const w = v.videoWidth || 960;
    const h = v.videoHeight || 540;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;

    let result: any = null;
    if (v.readyState >= 2) {
      const ts = performance.now();
      try {
        result = recognizer.recognizeForVideo(v, ts);
      } catch {}
    }

    drawFrame(ctx, w, h, result);

    rafRef.current = requestAnimationFrame(() => loop(recognizer));
  }

  function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, result: any) {
    ctx.clearRect(0, 0, w, h);

    const inAsl = aslModeRef.current;
    if (result?.landmarks?.length) {
      for (let hi = 0; hi < result.landmarks.length; hi++) {
        const hand = result.landmarks[hi];
        const cat = result.gestures?.[hi]?.[0];
        const isCertain = cat && cat.score > 0.7 && cat.categoryName !== "None";
        drawHandSkeleton(ctx, hand, w, h, isCertain);
        drawFingertipGlow(ctx, hand, w, h);
        if (!inAsl && cat && cat.categoryName !== "None" && isCertain) {
          maybeFireGesture(cat.categoryName, cat.score, hand[0], w, h);
        }
      }

      if (inAsl) {
        // Run ASL fingerspelling on the most prominent hand only
        const hand = result.landmarks[0];
        const pred = classifyAsl(hand);
        const now = performance.now();
        aslHoldRef.current.lastSeen = now;
        if (pred && pred.confidence >= 0.7) {
          setAslLetter(pred.letter);
          setAslConfidence(pred.confidence);
          const hold = aslHoldRef.current;
          if (hold.letter !== pred.letter) {
            hold.letter = pred.letter;
            hold.since = now;
          } else if (
            now - hold.since > 700 &&
            now - hold.commitedAt > 600 // debounce double-fires
          ) {
            commitLetter(pred.letter);
            hold.commitedAt = now;
            // require user to leave & re-enter the shape to fire it again
            hold.since = Number.MAX_SAFE_INTEGER;
          }
        } else {
          setAslLetter(null);
          setAslConfidence(0);
          aslHoldRef.current.letter = null;
        }
      } else {
        const top = result.gestures?.[0]?.[0];
        if (top) {
          setCurrentGesture(top.categoryName);
          setConfidence(top.score);
        } else {
          setCurrentGesture("None");
          setConfidence(0);
        }
      }
    } else {
      setCurrentGesture("None");
      setConfidence(0);
      if (inAsl) {
        const hold = aslHoldRef.current;
        const now = performance.now();
        // Auto-insert a space after 1.5s of no hand if buffer doesn't already end in space
        if (hold.lastSeen && now - hold.lastSeen > 1500) {
          setAslBuffer((b) => (b.length > 0 && !b.endsWith(" ") ? b + " " : b));
          hold.lastSeen = 0;
        }
        setAslLetter(null);
        setAslConfidence(0);
      }
    }

    drawFloatingLabels(ctx, w, h);
  }

  function commitLetter(letter: AslLetter) {
    setAslBuffer((b) => b + letter);
  }

  function clearBuffer() {
    setAslBuffer("");
    aslHoldRef.current = { letter: null, since: 0, commitedAt: 0, lastSeen: 0 };
  }

  function backspace() {
    setAslBuffer((b) => b.slice(0, -1));
  }

  function commitToPitch() {
    const trimmed = aslBuffer.trim();
    if (!trimmed) return;
    onPhrase(`[ASL fingerspelled] ${trimmed}`);
    clearBuffer();
  }

  function drawHandSkeleton(
    ctx: CanvasRenderingContext2D,
    hand: { x: number; y: number }[],
    w: number,
    h: number,
    glow: boolean
  ) {
    ctx.lineWidth = glow ? 4 : 3;
    ctx.strokeStyle = glow ? "rgba(124,92,255,0.95)" : "rgba(34,211,238,0.7)";
    ctx.shadowColor = glow ? "rgba(124,92,255,0.8)" : "rgba(34,211,238,0.6)";
    ctx.shadowBlur = glow ? 18 : 8;
    for (const [a, b] of CONNECTIONS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(245,243,238,0.92)";
    for (const lm of hand) {
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFingertipGlow(
    ctx: CanvasRenderingContext2D,
    hand: { x: number; y: number }[],
    w: number,
    h: number
  ) {
    for (const idx of FINGER_TIPS) {
      const lm = hand[idx];
      if (!lm) continue;
      const x = lm.x * w;
      const y = lm.y * h;
      const grad = ctx.createRadialGradient(x, y, 1, x, y, 26);
      grad.addColorStop(0, "rgba(34,211,238,0.85)");
      grad.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFloatingLabels(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const next: FloatingLabel[] = [];
    for (const lbl of labelsRef.current) {
      lbl.y += lbl.vy;
      lbl.alpha -= 0.012;
      if (lbl.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, lbl.alpha);
      ctx.font = "600 22px 'Space Grotesk', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#0a0a0f";
      ctx.strokeStyle = "rgba(124,92,255,1)";
      ctx.lineWidth = 6;
      ctx.strokeText(lbl.text, lbl.x, lbl.y);
      ctx.fillStyle = "#f5f3ee";
      ctx.fillText(lbl.text, lbl.x, lbl.y);
      ctx.restore();
      next.push(lbl);
    }
    labelsRef.current = next;
  }

  function maybeFireGesture(
    name: string,
    score: number,
    wrist: { x: number; y: number },
    w: number,
    h: number
  ) {
    const now = performance.now();
    const last = lastFireRef.current;
    // 1.2s debounce per gesture name; reset if a different gesture fires
    if (last && last.name === name && now - last.at < 1200) return;
    if (last && last.name !== name) lastFireRef.current = null;
    lastFireRef.current = { name, at: now };
    const phrase = GESTURE_VOCAB[name];
    const label = GESTURE_LABELS[name];
    if (!phrase) return;
    onPhrase(phrase);
    setRecognized((r) => [{ name, phrase, at: Date.now() }, ...r].slice(0, 8));
    labelsRef.current.push({
      id: labelIdRef.current++,
      text: label || name,
      x: wrist.x * w,
      y: wrist.y * h,
      vy: -1.2,
      alpha: 1,
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden relative">
        <div className="aspect-video bg-black flex items-center justify-center relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className={"absolute inset-0 w-full h-full object-cover " + (running ? "" : "hidden")}
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className={"absolute inset-0 w-full h-full pointer-events-none " + (running ? "" : "hidden")}
            style={{ transform: "scaleX(-1)" }}
          />

          {!running && (
            <div className="text-center p-6 relative z-10">
              <div className="text-sm text-white/70 mb-3">
                MediaPipe GestureRecognizer runs in your browser via WebAssembly.
                21 hand landmarks tracked at 30fps, 7 gestures recognised, no server roundtrip.
              </div>
              <button type="button" className="btn" onClick={start} disabled={loading}>
                {loading ? "📥 Loading model…" : "📷 Start gesture camera"}
              </button>
            </div>
          )}

          {running && !aslMode && (
            <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-black/70 text-xs font-mono text-white/80">
              ● live · {currentGesture !== "None" ? `${currentGesture} (${(confidence * 100).toFixed(0)}%)` : "…"}
            </div>
          )}
          {running && aslMode && (
            <>
              <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-black/70 text-xs font-mono text-white/80">
                ● ASL fingerspelling
              </div>
              {aslLetter && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div
                    className="text-[140px] font-bold leading-none"
                    style={{
                      color: "rgba(245,243,238,0.92)",
                      textShadow: "0 0 30px rgba(124,92,255,0.9), 0 0 80px rgba(124,92,255,0.4)",
                    }}
                  >
                    {aslLetter}
                  </div>
                </div>
              )}
              {aslLetter && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded-md bg-black/70 text-[11px] font-mono text-white/70">
                  hold {aslLetter} for ~700ms · {(aslConfidence * 100).toFixed(0)}%
                </div>
              )}
            </>
          )}
        </div>
        {running && (
          <div className="p-3 bg-black/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAslMode(false)}
                className={
                  "px-2.5 py-1 rounded-md text-xs border transition " +
                  (!aslMode ? "bg-accent/20 border-accent text-white" : "bg-white/5 border-white/10 text-white/60")
                }
              >
                7 Common gestures
              </button>
              <button
                type="button"
                onClick={() => setAslMode(true)}
                className={
                  "px-2.5 py-1 rounded-md text-xs border transition " +
                  (aslMode ? "bg-accent/20 border-accent text-white" : "bg-white/5 border-white/10 text-white/60")
                }
              >
                ASL fingerspelling
              </button>
            </div>
            <button type="button" className="btn-ghost text-xs" onClick={stop}>
              Stop
            </button>
          </div>
        )}
      </div>

      {running && aslMode && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Spelling buffer</div>
            <div className="text-[10px] text-white/40">
              supported: {SUPPORTED_LETTERS.join(", ")}
            </div>
          </div>
          <div
            className="rounded-md bg-black/40 border border-white/10 px-3 py-2 font-mono text-lg min-h-[2.5rem]"
            style={{ letterSpacing: "0.15em" }}
          >
            {aslBuffer || <span className="text-white/30">…</span>}
            {aslLetter && (
              <span className="text-accent2 animate-pulse"> {aslLetter}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={backspace} disabled={!aslBuffer}>
              ⌫ Backspace
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={() => setAslBuffer((b) => b + " ")}>
              ␣ Space
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={clearBuffer} disabled={!aslBuffer}>
              Clear
            </button>
            <div className="flex-1" />
            <button type="button" className="btn text-sm" onClick={commitToPitch} disabled={!aslBuffer.trim()}>
              ↩ Add to pitch
            </button>
          </div>
          <div className="text-[10px] text-white/40 leading-snug">
            Static-shape ASL fingerspelling, 12-letter subset. J and Z are motion letters and not yet
            handled. Hold each letter ~700ms to commit; pause &gt;1.5s for a space; the assembled
            phrase is added to your pitch when you click <em>Add to pitch</em>.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {Object.entries(GESTURE_LABELS)
          .filter(([k]) => k !== "None")
          .map(([k, label]) => (
            <div
              key={k}
              className={
                "rounded-md px-2 py-1.5 border text-center " +
                (currentGesture === k && confidence > 0.7
                  ? "bg-accent/20 border-accent text-white"
                  : "bg-white/5 border-white/10 text-white/60")
              }
              title={GESTURE_VOCAB[k]}
            >
              {label}
            </div>
          ))}
      </div>

      {recognized.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Recognised gestures</div>
          {recognized.map((r) => (
            <div key={r.at} className="flex items-baseline justify-between gap-2">
              <span className="text-white/80">{GESTURE_LABELS[r.name]}</span>
              <span className="text-white/50 italic truncate">"{r.phrase}"</span>
            </div>
          ))}
        </div>
      )}

      {err && <div className="text-warn text-xs">{err}</div>}
    </div>
  );
}
