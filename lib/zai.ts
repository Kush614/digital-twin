import OpenAI from "openai";

// Z.AI key pool with per-key cooldown + automatic failover.
//
// Configure either:
//   ZAI_API_KEY=<single_key>
//   ZAI_API_KEYS=<key1>,<key2>,<key3>      (comma-separated; whitespace ok)
//
// When a call returns a billing / quota error (HTTP 429, error code 1113,
// "insufficient balance", "recharge", "quota", "exceeded"), the offending
// key is parked on a 5-minute cooldown and the next available key is tried.
// Non-billing errors are not retried — they propagate immediately so the
// caller can surface them.

const ZAI_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const TEXT_MODEL = process.env.ZAI_MODEL || "glm-4.5";
const VISION_MODEL = process.env.ZAI_VISION_MODEL || "glm-4.5v";

const COOLDOWN_MS = 5 * 60 * 1000;

type KeyState = {
  key: string;
  cooldownUntil: number;
  lastError?: string;
  failures: number;
  successes: number;
};

function parseKeys(): string[] {
  const raw: string[] = [];
  const multi = process.env.ZAI_API_KEYS;
  if (multi) raw.push(...multi.split(/[,\s]+/));
  const single = process.env.ZAI_API_KEY;
  if (single) raw.push(single);
  // dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const t = k.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

const STATE: KeyState[] = parseKeys().map((k) => ({
  key: k,
  cooldownUntil: 0,
  failures: 0,
  successes: 0,
}));

export function hasZaiKeys(): boolean {
  return STATE.length > 0;
}

export function poolSize(): number {
  return STATE.length;
}

export function poolStatus() {
  const now = Date.now();
  return STATE.map((s) => ({
    key: maskKey(s.key),
    cooldownRemainingSec: Math.max(0, Math.round((s.cooldownUntil - now) / 1000)),
    failures: s.failures,
    successes: s.successes,
    lastError: s.lastError,
  }));
}

export type ZaiOpts = { vision?: boolean };

export async function withZai<T>(
  fn: (client: OpenAI, model: string) => Promise<T>,
  opts: ZaiOpts = {}
): Promise<T> {
  if (STATE.length === 0) {
    throw new Error("No Z.AI keys configured (set ZAI_API_KEY or ZAI_API_KEYS).");
  }
  const model = opts.vision ? VISION_MODEL : TEXT_MODEL;
  const now = Date.now();
  // Try non-cooled keys first, then any keys whose cooldown has expired.
  const ranked = [...STATE].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  const errors: string[] = [];
  for (const s of ranked) {
    if (s.cooldownUntil > Date.now()) {
      errors.push(`${maskKey(s.key)}: cooling ${Math.round((s.cooldownUntil - Date.now()) / 1000)}s`);
      continue;
    }
    const client = new OpenAI({ apiKey: s.key, baseURL: ZAI_URL });
    try {
      const result = await fn(client, model);
      s.successes++;
      // a successful call clears any prior error
      s.lastError = undefined;
      return result;
    } catch (e: any) {
      const msg = (e?.message ?? String(e)).slice(0, 240);
      const status = e?.status ?? e?.response?.status;
      const billing = status === 429 || /1113|insufficient balance|recharge|quota|exceeded|rate.?limit/i.test(msg);
      if (billing) {
        s.cooldownUntil = Date.now() + COOLDOWN_MS;
        s.lastError = msg;
        s.failures++;
        errors.push(`${maskKey(s.key)} → ${msg.slice(0, 100)}`);
        continue; // try next key
      }
      // non-billing error — propagate
      throw e;
    }
  }
  const err = new Error(
    `All ${STATE.length} Z.AI keys exhausted (5-min cooldowns active). ${errors.join(" | ")}`
  );
  (err as any).code = "ZAI_POOL_EXHAUSTED";
  throw err;
}

function maskKey(k: string): string {
  if (k.length < 12) return "***";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
