import OpenAI from "openai";
import type { VisionEvidence } from "./types";

const ZAI_KEY = process.env.ZAI_API_KEY;
const ZAI_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
// Z.AI's vision-language model. GLM-4.5V is multimodal (image + text → text).
// Override via env if a different vision SKU is preferred (e.g. glm-4v-plus).
const ZAI_VISION_MODEL = process.env.ZAI_VISION_MODEL || "glm-4.5v";

const SYSTEM = `You are an evidence extractor for a public-goods grant evaluator.
You will receive a single image (a screenshot, demo capture, whiteboard photo, or
diagram) submitted alongside a written pitch. Your job is to:

1. describe what is concretely visible (no speculation),
2. extract discrete claims a reviewer could cross-check against the pitch,
3. note technical signals (UI polish, recognisable frameworks, real data vs. lorem ipsum),
4. estimate the probability the image is AI-generated or stitched from stock assets.

Be skeptical of glossy hero shots, pristine UI with placeholder text, mismatched
shadows, anatomically-impossible hands, and impossible-to-find UI elements.
Reply with ONLY a single JSON object:

{"description":"…","claimsVisible":["…"],"technicalSignals":["…"],"syntheticConfidence":0.0}

Keep the description ≤ 240 characters. Each claim ≤ 100 characters.
syntheticConfidence is a float in [0,1].`;

export async function analyzeImage(imageDataUrl: string, source: VisionEvidence["source"]): Promise<VisionEvidence> {
  if (!ZAI_KEY) {
    return mockAnalyze(source);
  }
  const client = new OpenAI({ apiKey: ZAI_KEY, baseURL: ZAI_URL });
  try {
    const res = await client.chat.completions.create({
      model: ZAI_VISION_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse this submission image and reply with the strict JSON object." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ] as any,
        },
      ],
    });
    const raw = res.choices?.[0]?.message?.content ?? "";
    const parsed = parseStrict(raw);
    if (!parsed) return mockAnalyze(source, "model returned non-JSON");
    return {
      source,
      description: parsed.description,
      claimsVisible: parsed.claimsVisible,
      technicalSignals: parsed.technicalSignals,
      syntheticConfidence: parsed.syntheticConfidence,
      rawModel: ZAI_VISION_MODEL,
      fetchedAt: Date.now(),
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (/1113|insufficient balance|recharge|quota/i.test(msg)) {
      return mockAnalyze(source, "Z.AI account out of balance — top up to enable vision analysis");
    }
    return mockAnalyze(source, msg);
  }
}

function parseStrict(raw: string): {
  description: string;
  claimsVisible: string[];
  technicalSignals: string[];
  syntheticConfidence: number;
} | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    return {
      description: typeof obj.description === "string" ? obj.description.slice(0, 480) : "",
      claimsVisible: Array.isArray(obj.claimsVisible) ? obj.claimsVisible.map(String).slice(0, 12) : [],
      technicalSignals: Array.isArray(obj.technicalSignals) ? obj.technicalSignals.map(String).slice(0, 12) : [],
      syntheticConfidence: clamp01(obj.syntheticConfidence),
    };
  } catch {
    return null;
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function mockAnalyze(source: VisionEvidence["source"], reason?: string): VisionEvidence {
  return {
    source,
    description:
      "[mock] no ZAI_API_KEY — vision analysis skipped. Set ZAI_API_KEY in .env.local to use GLM-4.5V.",
    claimsVisible: [],
    technicalSignals: [],
    syntheticConfidence: 0,
    rawModel: reason ? `mock (${reason})` : "mock",
    fetchedAt: Date.now(),
  };
}
