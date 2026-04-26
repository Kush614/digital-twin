// ASL fingerspelling classifier — rule-based over MediaPipe hand landmarks.
//
// MediaPipe Hands returns 21 landmarks per hand:
//   0  wrist
//   1-4   thumb (CMC, MCP, IP, TIP)
//   5-8   index (MCP, PIP, DIP, TIP)
//   9-12  middle (MCP, PIP, DIP, TIP)
//   13-16 ring (MCP, PIP, DIP, TIP)
//   17-20 pinky (MCP, PIP, DIP, TIP)
//
// We classify a single static hand shape into one of:
//   A, B, C, D, I, L, O, U, V, W, Y, FIVE
// — the most visually distinct subset of the ASL alphabet (plus open palm).
// J and Z are motion gestures and intentionally not handled here.

export type Pt = { x: number; y: number; z?: number };

type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";

type FingerStat = {
  extended: boolean;        // tip well above MCP, joints aligned
  curled: boolean;          // tip below or at MCP
  tipNearWrist: number;     // 0..1 normalised
  bendAngleDeg: number;     // angle at PIP (180 = straight)
};

type HandStats = Record<FingerName, FingerStat> & {
  spread: number;           // distance between index tip and pinky tip / palm width
  palmWidth: number;
  thumbToIndexTip: number;  // for O / F-shape detection
  thumbToMiddleTip: number;
  facingCamera: boolean;
};

const FINGER_INDICES: Record<FingerName, [number, number, number, number]> = {
  thumb:  [1, 2, 3, 4],
  index:  [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring:   [13, 14, 15, 16],
  pinky:  [17, 18, 19, 20],
};

function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function angle3(a: Pt, b: Pt, c: Pt): number {
  // angle at vertex b (in degrees)
  const ux = a.x - b.x, uy = a.y - b.y;
  const vx = c.x - b.x, vy = c.y - b.y;
  const dot = ux * vx + uy * vy;
  const mag = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1e-6;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

function fingerStat(landmarks: Pt[], name: FingerName, palmWidth: number): FingerStat {
  const [mcp, pip, dip, tip] = FINGER_INDICES[name].map((i) => landmarks[i]);
  const wrist = landmarks[0];
  const bendAngleDeg = angle3(mcp, pip, tip);
  const tipToWrist = dist(tip, wrist);
  const mcpToWrist = dist(mcp, wrist);
  const tipNearWrist = Math.max(0, 1 - tipToWrist / Math.max(0.0001, palmWidth * 2));
  // Extended: tip is meaningfully farther from wrist than MCP, AND finger is mostly straight
  const extended =
    tipToWrist > mcpToWrist * (name === "thumb" ? 1.05 : 1.45) && bendAngleDeg > 140;
  // Curled: tip is closer to wrist than the MCP
  const curled = tipToWrist < mcpToWrist * (name === "thumb" ? 0.95 : 0.95);
  return { extended, curled, tipNearWrist, bendAngleDeg };
}

export function computeHandStats(landmarks: Pt[]): HandStats | null {
  if (!landmarks || landmarks.length < 21) return null;
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const palmWidth = dist(indexMcp, pinkyMcp) || 0.01;
  const thumb  = fingerStat(landmarks, "thumb",  palmWidth);
  const index  = fingerStat(landmarks, "index",  palmWidth);
  const middle = fingerStat(landmarks, "middle", palmWidth);
  const ring   = fingerStat(landmarks, "ring",   palmWidth);
  const pinky  = fingerStat(landmarks, "pinky",  palmWidth);
  const indexTip = landmarks[8];
  const pinkyTip = landmarks[20];
  const thumbTip = landmarks[4];
  const middleTip = landmarks[12];
  const spread = dist(indexTip, pinkyTip) / palmWidth;
  const thumbToIndexTip = dist(thumbTip, indexTip) / palmWidth;
  const thumbToMiddleTip = dist(thumbTip, middleTip) / palmWidth;
  // Facing camera ≈ the palm normal points toward us. Heuristic: pinky-to-index
  // along positive X means right-hand palm visible; check sign of cross product.
  const facingCamera = true; // simplified — we accept either orientation
  return {
    thumb, index, middle, ring, pinky,
    spread, palmWidth, thumbToIndexTip, thumbToMiddleTip, facingCamera,
  };
}

export type AslLetter =
  | "A" | "B" | "C" | "D" | "I" | "L" | "O" | "U" | "V" | "W" | "Y" | "5";

export type AslPrediction = { letter: AslLetter; confidence: number } | null;

// Each predicate returns 0..1 confidence given hand stats + raw landmarks.
const TEMPLATES: { letter: AslLetter; score: (s: HandStats, lm: Pt[]) => number }[] = [
  {
    letter: "A",
    // Closed fist, thumb resting on the side (not curled into the fingers)
    score: (s) =>
      !s.index.extended && !s.middle.extended && !s.ring.extended && !s.pinky.extended &&
      s.index.curled && s.middle.curled && s.ring.curled && s.pinky.curled
        ? 0.85
        : 0,
  },
  {
    letter: "B",
    // Four fingers up + parallel + thumb folded across palm (close to index MCP)
    score: (s, lm) => {
      const allUp = s.index.extended && s.middle.extended && s.ring.extended && s.pinky.extended;
      const thumbAcross = !s.thumb.extended && dist(lm[4], lm[5]) / s.palmWidth < 0.7;
      const tight = s.spread < 0.9; // not splayed
      return allUp && thumbAcross && tight ? 0.9 : 0;
    },
  },
  {
    letter: "5",
    // All five fingers extended and splayed
    score: (s) => {
      const allUp =
        s.thumb.extended && s.index.extended && s.middle.extended && s.ring.extended && s.pinky.extended;
      return allUp && s.spread > 1.0 ? 0.85 : 0;
    },
  },
  {
    letter: "C",
    // All fingers gently curved into a C — none fully extended, none fully curled,
    // bend angles ~110-150°, thumb extended toward index but not touching
    score: (s) => {
      const allCurved = [s.index, s.middle, s.ring, s.pinky].every(
        (f) => !f.extended && !f.curled && f.bendAngleDeg > 100 && f.bendAngleDeg < 160
      );
      return allCurved && s.thumbToIndexTip > 0.5 && s.thumbToIndexTip < 1.4 ? 0.75 : 0;
    },
  },
  {
    letter: "D",
    // Index up, others curled, thumb meets middle finger tip (forms the loop)
    score: (s) =>
      s.index.extended && !s.middle.extended && !s.ring.extended && !s.pinky.extended &&
      s.thumbToMiddleTip < 0.55
        ? 0.9
        : 0,
  },
  {
    letter: "I",
    // Pinky up, all others curled, thumb across palm
    score: (s) =>
      !s.index.extended && !s.middle.extended && !s.ring.extended && s.pinky.extended &&
      s.index.curled && s.middle.curled && s.ring.curled
        ? 0.9
        : 0,
  },
  {
    letter: "L",
    // Thumb + index out, others curled, thumb roughly perpendicular to index
    score: (s, lm) => {
      const ok =
        s.thumb.extended && s.index.extended &&
        !s.middle.extended && !s.ring.extended && !s.pinky.extended;
      if (!ok) return 0;
      // angle between thumb-tip vector and index-tip vector should be near 90°
      const v1 = { x: lm[4].x - lm[2].x, y: lm[4].y - lm[2].y };
      const v2 = { x: lm[8].x - lm[5].x, y: lm[8].y - lm[5].y };
      const cos = (v1.x * v2.x + v1.y * v2.y) /
        (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1e-6);
      return Math.abs(cos) < 0.4 ? 0.9 : 0.4;
    },
  },
  {
    letter: "O",
    // Thumb tip meets index tip (loop), other fingers curled toward thumb too
    score: (s) =>
      !s.index.extended && !s.middle.extended && !s.ring.extended && !s.pinky.extended &&
      s.thumbToIndexTip < 0.45
        ? 0.85
        : 0,
  },
  {
    letter: "U",
    // Index + middle up parallel (close together), ring + pinky curled
    score: (s, lm) => {
      const ok =
        s.index.extended && s.middle.extended && !s.ring.extended && !s.pinky.extended;
      if (!ok) return 0;
      const tipsClose = dist(lm[8], lm[12]) / s.palmWidth < 0.4;
      return tipsClose ? 0.9 : 0;
    },
  },
  {
    letter: "V",
    // Index + middle up apart (V shape), ring + pinky curled
    score: (s, lm) => {
      const ok =
        s.index.extended && s.middle.extended && !s.ring.extended && !s.pinky.extended;
      if (!ok) return 0;
      const tipsApart = dist(lm[8], lm[12]) / s.palmWidth > 0.55;
      return tipsApart ? 0.9 : 0;
    },
  },
  {
    letter: "W",
    // Index + middle + ring up, pinky curled, thumb across pinky
    score: (s) =>
      s.index.extended && s.middle.extended && s.ring.extended && !s.pinky.extended
        ? 0.85
        : 0,
  },
  {
    letter: "Y",
    // Thumb + pinky out, others curled
    score: (s) =>
      s.thumb.extended && !s.index.extended && !s.middle.extended && !s.ring.extended && s.pinky.extended
        ? 0.9
        : 0,
  },
];

export function classifyAsl(landmarks: Pt[]): AslPrediction {
  const stats = computeHandStats(landmarks);
  if (!stats) return null;
  let best: AslPrediction = null;
  for (const t of TEMPLATES) {
    const c = t.score(stats, landmarks);
    if (c <= 0) continue;
    if (!best || c > best.confidence) best = { letter: t.letter, confidence: c };
  }
  return best;
}

export const SUPPORTED_LETTERS: AslLetter[] = [
  "A", "B", "C", "D", "I", "L", "O", "U", "V", "W", "Y", "5",
];
