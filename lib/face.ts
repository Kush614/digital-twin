import type { Application, FaceDescriptor, FraudFlag } from "./types";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Threshold tuned conservatively: same person across sessions tends to score
// 0.96+; different people tend to land below 0.90. Anything ≥ 0.93 is a flag,
// ≥ 0.97 is a hard match.
export function compareDescriptors(
  a: FaceDescriptor | undefined,
  b: FaceDescriptor | undefined
): { similarity: number; match: "none" | "soft" | "hard" } {
  if (!a?.vector?.length || !b?.vector?.length) return { similarity: 0, match: "none" };
  const sim = cosineSimilarity(a.vector, b.vector);
  if (sim >= 0.97) return { similarity: sim, match: "hard" };
  if (sim >= 0.93) return { similarity: sim, match: "soft" };
  return { similarity: sim, match: "none" };
}

export function detectDuplicateFace(
  current: Application,
  others: Application[]
): FraudFlag | null {
  if (!current.faceDescriptor) return null;
  let best: { app: Application; similarity: number; match: "soft" | "hard" } | null = null;
  for (const other of others) {
    if (other.id === current.id) continue;
    if (!other.faceDescriptor) continue;
    const cmp = compareDescriptors(current.faceDescriptor, other.faceDescriptor);
    if (cmp.match === "none") continue;
    if (!best || cmp.similarity > best.similarity) {
      best = { app: other, similarity: cmp.similarity, match: cmp.match };
    }
  }
  if (!best) return null;
  const sameWallet =
    best.app.walletAddress &&
    current.walletAddress &&
    best.app.walletAddress.toLowerCase() === current.walletAddress.toLowerCase();
  return {
    kind: "duplicate-face",
    severity: best.match === "hard" && !sameWallet ? "high" : "medium",
    detail: `Face descriptor matches application "${best.app.projectName}" (${(
      best.similarity * 100
    ).toFixed(1)}% similarity)${sameWallet ? " — same wallet" : " — different wallet (sybil pattern)"}.`,
  };
}
