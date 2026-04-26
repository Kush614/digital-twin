import { hasZaiKeys, withZai } from "./zai";
import type { VisionEvidence } from "./types";

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
  if (!hasZaiKeys()) {
    return mockAnalyze(source);
  }
  try {
    const { raw, model } = await withZai(
      async (client, model) => {
        const res = await client.chat.completions.create({
          model,
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
        return { raw: res.choices?.[0]?.message?.content ?? "", model };
      },
      { vision: true }
    );
    const parsed = parseStrict(raw);
    if (!parsed) return mockAnalyze(source, "model returned non-JSON");
    return {
      source,
      description: parsed.description,
      claimsVisible: parsed.claimsVisible,
      technicalSignals: parsed.technicalSignals,
      syntheticConfidence: parsed.syntheticConfidence,
      rawModel: model,
      fetchedAt: Date.now(),
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if ((e as any)?.code === "ZAI_POOL_EXHAUSTED") {
      return mockAnalyze(source, "All Z.AI keys cooling down — vision will retry shortly.");
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
