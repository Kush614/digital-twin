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

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
};

type TrailFrame = {
  pts: { x: number; y: number }[];
  age: number; // frames
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
  const particlesRef = useRef<Particle[]>([]);
  const trailRef = useRef<TrailFrame[]>([]);
  const flashRef = useRef(0);
  const shimmerTRef = useRef(0);
  const aiThinkingRef = useRef(false);
  useEffect(() => { aiThinkingRef.current = aiThinking; }, [aiThinking]);
  const lastBufferLengthRef = useRef(0);
  const [popKey, setPopKey] = useState(0);
  const [confetti, setConfetti] = useState<{ id: number; left: number; color: string; delay: number }[]>([]);

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currentGesture, setCurrentGesture] = useState<string>("None");
  const [confidence, setConfidence] = useState<number>(0);
  const [recognized, setRecognized] = useState<{ name: string; phrase: string; at: number }[]>([]);

  // ASL fingerspelling state
  type AslEngine = "off" | "rules" | "ai";
  const [aslEngine, setAslEngine] = useState<AslEngine>("off");
  const aslEngineRef = useRef<AslEngine>("off");
  useEffect(() => { aslEngineRef.current = aslEngine; }, [aslEngine]);
  const [aslLetter, setAslLetter] = useState<string | null>(null);
  const [aslConfidence, setAslConfidence] = useState(0);
  const [aslBuffer, setAslBuffer] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiReason, setAiReason] = useState<string>("");
  const aslHoldRef = useRef<{ letter: string | null; since: number; commitedAt: number; lastSeen: number }>({
    letter: null,
    since: 0,
    commitedAt: 0,
    lastSeen: 0,
  });
  const aiCaptureRef = useRef<{ lastLandmarks: { x: number; y: number }[] | null; steadySince: number; lastFiredAt: number; inflight: boolean }>({
    lastLandmarks: null,
    steadySince: 0,
    lastFiredAt: 0,
    inflight: false,
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

    // Hand skeleton trail (drawn first so it's behind the live skeleton).
    drawTrail(ctx, w, h);

    const engine = aslEngineRef.current;
    if (result?.landmarks?.length) {
      for (let hi = 0; hi < result.landmarks.length; hi++) {
        const hand = result.landmarks[hi];
        const cat = result.gestures?.[hi]?.[0];
        const isCertain = cat && cat.score > 0.7 && cat.categoryName !== "None";
        drawHandSkeleton(ctx, hand, w, h, isCertain);
        drawFingertipGlow(ctx, hand, w, h);
        if (engine === "off" && cat && cat.categoryName !== "None" && isCertain) {
          maybeFireGesture(cat.categoryName, cat.score, hand[0], w, h);
        }
      }

      const hand = result.landmarks[0];
      const now = performance.now();

      // Push a trail snapshot every ~3 frames; cap at 8 frames in flight.
      pushTrail(hand);

      if (engine === "rules") {
        const pred = classifyAsl(hand);
        aslHoldRef.current.lastSeen = now;
        if (pred && pred.confidence >= 0.7) {
          setAslLetter(pred.letter);
          setAslConfidence(pred.confidence);
          const hold = aslHoldRef.current;
          if (hold.letter !== pred.letter) {
            hold.letter = pred.letter;
            hold.since = now;
          } else if (now - hold.since > 700 && now - hold.commitedAt > 600) {
            commitLetter(pred.letter);
            hold.commitedAt = now;
            hold.since = Number.MAX_SAFE_INTEGER;
          }
        } else {
          setAslLetter(null);
          setAslConfidence(0);
          aslHoldRef.current.letter = null;
        }
      }

      if (engine === "ai") {
        // Steadiness detector: send a frame to Z.AI when motion is low for ~800ms
        const cap = aiCaptureRef.current;
        cap.lastSeen = now;
        const motion = handMotion(cap.lastLandmarks, hand);
        cap.lastLandmarks = hand.map((p: any) => ({ x: p.x, y: p.y }));
        const isSteady = motion < 0.012;
        if (!isSteady) cap.steadySince = now;
        const steadyMs = cap.steadySince ? now - cap.steadySince : 0;
        const heldLongEnough = steadyMs > 800;
        const cooldownDone = now - cap.lastFiredAt > 1800;
        if (heldLongEnough && cooldownDone && !cap.inflight) {
          cap.inflight = true;
          cap.lastFiredAt = now;
          fireAiCapture(hand, w, h, v).finally(() => {
            cap.inflight = false;
          });
        }
        // Steadiness arc — Apple-Pay-style filling ring around the hand.
        const progress = Math.max(0, Math.min(1, steadyMs / 800));
        drawSteadinessRing(ctx, hand, w, h, progress);
      }

      if (engine === "off") {
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
      if (engine === "rules" || engine === "ai") {
        const hold = aslHoldRef.current;
        const now = performance.now();
        if (hold.lastSeen && now - hold.lastSeen > 1500) {
          setAslBuffer((b) => (b.length > 0 && !b.endsWith(" ") ? b + " " : b));
          hold.lastSeen = 0;
        }
        setAslLetter(null);
        setAslConfidence(0);
      }
    }

    drawFloatingLabels(ctx, w, h);
    drawParticles(ctx);
    if (aiThinkingRef.current) drawShimmer(ctx, w, h);
    drawFlash(ctx, w, h);
  }

  function pushTrail(hand: { x: number; y: number }[]) {
    // sample at ~10fps regardless of rAF rate
    const now = performance.now();
    const last = trailRef.current[trailRef.current.length - 1];
    if (last && now - (last as any).t < 90) return;
    const snap: TrailFrame = {
      pts: hand.map((p) => ({ x: p.x, y: p.y })),
      age: 0,
    };
    (snap as any).t = now;
    trailRef.current.push(snap);
    if (trailRef.current.length > 8) trailRef.current.shift();
  }

  function drawTrail(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const arr = trailRef.current;
    if (arr.length < 2) {
      arr.forEach((s) => (s.age++));
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const snap = arr[i];
      snap.age++;
      const alpha = (i / arr.length) * 0.25;
      if (alpha < 0.02) continue;
      ctx.strokeStyle = `rgba(124,92,255,${alpha})`;
      ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        const pa = snap.pts[a];
        const pb = snap.pts[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
        ctx.stroke();
      }
    }
  }

  function drawSteadinessRing(
    ctx: CanvasRenderingContext2D,
    hand: { x: number; y: number }[],
    w: number,
    h: number,
    progress: number
  ) {
    if (progress <= 0) return;
    let sx = 0, sy = 0;
    for (const p of hand) { sx += p.x; sy += p.y; }
    const cx = (sx / hand.length) * w;
    const cy = (sy / hand.length) * h;
    const r = Math.min(w, h) * 0.18;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(34,211,238,${0.55 + 0.4 * progress})`;
    ctx.shadowColor = "rgba(34,211,238,0.7)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawParticles(ctx: CanvasRenderingContext2D) {
    const next: Particle[] = [];
    for (const p of particlesRef.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gravity
      p.vx *= 0.985;
      p.life -= 0.025;
      if (p.life <= 0) continue;
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `hsla(${p.hue},85%,68%,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life + 1, 0, Math.PI * 2);
      ctx.fill();
      next.push(p);
    }
    particlesRef.current = next;
  }

  function drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (flashRef.current <= 0) return;
    ctx.fillStyle = `rgba(245,243,238,${flashRef.current * 0.45})`;
    ctx.fillRect(0, 0, w, h);
    flashRef.current = Math.max(0, flashRef.current - 0.06);
  }

  function drawShimmer(ctx: CanvasRenderingContext2D, w: number, h: number) {
    shimmerTRef.current = (shimmerTRef.current + 0.018) % 1;
    const x = (shimmerTRef.current * (w + 200)) - 100;
    const grad = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
    grad.addColorStop(0, "rgba(124,92,255,0)");
    grad.addColorStop(0.5, "rgba(124,92,255,0.18)");
    grad.addColorStop(1, "rgba(124,92,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // ring around the hand if known
    const last = trailRef.current[trailRef.current.length - 1]?.pts;
    if (last) {
      let sx = 0, sy = 0;
      for (const p of last) { sx += p.x; sy += p.y; }
      const cx = (sx / last.length) * w;
      const cy = (sy / last.length) * h;
      const r = Math.min(w, h) * (0.16 + 0.04 * Math.sin(performance.now() / 140));
      ctx.strokeStyle = "rgba(124,92,255,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function handMotion(prev: { x: number; y: number }[] | null, curr: { x: number; y: number }[]): number {
    if (!prev || prev.length !== curr.length) return 1;
    let sum = 0;
    for (let i = 0; i < prev.length; i++) {
      sum += Math.hypot(prev[i].x - curr[i].x, prev[i].y - curr[i].y);
    }
    return sum / prev.length;
  }

  async function fireAiCapture(
    hand: { x: number; y: number }[],
    w: number,
    h: number,
    video: HTMLVideoElement
  ) {
    // Crop a square around the hand bbox with ~30% padding
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of hand) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const half = Math.max(maxX - minX, maxY - minY) * 0.7 + 0.05;
    const sx = Math.max(0, (cx - half) * w);
    const sy = Math.max(0, (cy - half) * h);
    const sw = Math.min(w - sx, half * 2 * w);
    const sh = Math.min(h - sy, half * 2 * h);
    const out = document.createElement("canvas");
    out.width = 320;
    out.height = 320;
    const octx = out.getContext("2d");
    if (!octx) return;
    octx.drawImage(video, sx, sy, sw, sh, 0, 0, 320, 320);
    const dataUrl = out.toDataURL("image/jpeg", 0.85);

    setAiThinking(true);
    setAiReason("");
    try {
      const r = await fetch("/api/asl/recognize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.formErrors?.join(", ") ?? "asl call failed");
      const res = data.result;
      setAiReason(res?.reason || "");
      if (res?.letter && res.confidence >= 0.55) {
        setAslLetter(res.letter);
        setAslConfidence(res.confidence);
        commitLetter(res.letter);
      } else {
        setAslLetter(null);
        setAslConfidence(0);
      }
    } catch (e: any) {
      setAiReason(e?.message ?? "Z.AI request failed");
    } finally {
      setAiThinking(false);
    }
  }

  function commitLetter(letter: string) {
    setAslBuffer((b) => b + letter);
    setPopKey((k) => k + 1);
    // Burst — uses last hand center if known, otherwise canvas center
    const c = canvasRef.current;
    const last = trailRef.current[trailRef.current.length - 1]?.pts;
    let cx = (c?.width ?? 960) / 2;
    let cy = (c?.height ?? 540) / 2;
    if (last && last.length) {
      let sx = 0, sy = 0;
      for (const p of last) { sx += p.x; sy += p.y; }
      cx = (sx / last.length) * (c?.width ?? 960);
      cy = (sy / last.length) * (c?.height ?? 540);
    }
    spawnParticles(cx, cy, 26);
    flashRef.current = 1;
  }

  function spawnParticles(cx: number, cy: number, count: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 4 + Math.random() * 5;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1,
        life: 1,
        hue: Math.random() < 0.5 ? 260 : 190,
      });
    }
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
    const tag =
      aslEngineRef.current === "ai"
        ? "[ASL fingerspelled · Z.AI vision]"
        : "[ASL fingerspelled · rule-based]";
    onPhrase(`${tag} ${trimmed}`);
    // confetti
    const colors = ["#7c5cff", "#22d3ee", "#f5f3ee", "#fbbf24"];
    const next = Array.from({ length: 22 }).map((_, i) => ({
      id: Date.now() + i,
      left: 10 + Math.random() * 80,
      color: colors[i % colors.length],
      delay: Math.random() * 200,
    }));
    setConfetti(next);
    setTimeout(() => setConfetti([]), 1300);
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

          {running && aslEngine === "off" && (
            <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-black/70 text-xs font-mono text-white/80">
              ● live · {currentGesture !== "None" ? `${currentGesture} (${(confidence * 100).toFixed(0)}%)` : "…"}
            </div>
          )}
          {running && aslEngine !== "off" && (
            <>
              <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-black/70 text-xs font-mono text-white/80">
                ● {aslEngine === "ai" ? "Z.AI ASL · live" : "ASL fingerspelling · rules"}
              </div>
              {aiThinking && (
                <div className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-accent/30 border border-accent text-[11px] font-mono text-white animate-pulse">
                  🧠 GLM-4.5V analysing…
                </div>
              )}
              {aslLetter && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div
                    className="text-[140px] font-bold leading-none"
                    style={{
                      color: "rgba(245,243,238,0.92)",
                      textShadow: "0 0 30px rgba(124,92,255,0.9), 0 0 80px rgba(124,92,255,0.4)",
                      animation: "letter-breathe 1.2s ease-in-out infinite",
                    }}
                  >
                    {aslLetter}
                  </div>
                </div>
              )}
              {aslLetter && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded-md bg-black/70 text-[11px] font-mono text-white/70">
                  {aslEngine === "ai" ? "Z.AI" : "rules"} · {aslLetter} · {(aslConfidence * 100).toFixed(0)}%
                </div>
              )}
            </>
          )}
        </div>
        {running && (
          <div className="p-3 bg-black/50 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: "off",   label: "7 Common" },
                  { id: "rules", label: "ASL · rules" },
                  { id: "ai",    label: "🧠 ASL · Z.AI live" },
                ] as { id: AslEngine; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setAslEngine(m.id);
                    setAslLetter(null);
                    setAslConfidence(0);
                    aslHoldRef.current = { letter: null, since: 0, commitedAt: 0, lastSeen: 0 };
                    aiCaptureRef.current = { lastLandmarks: null, steadySince: 0, lastFiredAt: 0, inflight: false };
                  }}
                  className={
                    "px-2.5 py-1 rounded-md text-xs border transition " +
                    (aslEngine === m.id
                      ? "bg-accent/20 border-accent text-white"
                      : "bg-white/5 border-white/10 text-white/60")
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost text-xs" onClick={stop}>
              Stop
            </button>
          </div>
        )}
      </div>

      {running && aslEngine !== "off" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Spelling buffer · {aslEngine === "ai" ? "Z.AI vision (full A-Z)" : "rule-based (12 letters)"}
            </div>
            <div className="text-[10px] text-white/40">
              {aslEngine === "ai"
                ? "auto-fires on steady hand · ~1.5s/letter"
                : `supported: ${SUPPORTED_LETTERS.join(", ")}`}
            </div>
          </div>
          <div
            className={
              "relative rounded-md bg-black/40 border border-white/10 px-3 py-2 font-mono text-lg min-h-[2.5rem] overflow-hidden " +
              (aiThinking ? "buffer-shimmer" : "")
            }
            style={{ letterSpacing: "0.15em" }}
          >
            {aslBuffer.length === 0 ? (
              <span className="text-white/30">…</span>
            ) : (
              <>
                <span>{aslBuffer.slice(0, -1)}</span>
                <span key={popKey} className="letter-pop">
                  {aslBuffer.slice(-1)}
                </span>
              </>
            )}
            {aslLetter && !aiThinking && (
              <span className="text-accent2/60 ml-1 animate-pulse">{aslLetter}?</span>
            )}
            {confetti.map((c) => (
              <span
                key={c.id}
                className="confetti"
                style={{
                  left: `${c.left}%`,
                  bottom: 0,
                  background: c.color,
                  animationDelay: `${c.delay}ms`,
                }}
              />
            ))}
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
            {aslEngine === "ai"
              ? "Z.AI GLM-4.5V identifies the letter from a cropped hand image. Hold the shape steady for ~800ms — the inflight indicator confirms it's analysing. Full A-Z including motion letters J and Z."
              : "Rule-based static-shape recognition over MediaPipe landmarks. 12-letter subset. Hold each letter ~700ms; pause >1.5s for a space."}
            {" "}
            {aiReason && aslEngine === "ai" && (
              <span className="block mt-1 italic text-white/60">↳ {aiReason}</span>
            )}
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
