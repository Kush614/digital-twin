import { hasZaiKeys, withZai } from "./zai";

const SYSTEM = `You are an ASL fingerspelling recogniser. The image contains a
single hand making one letter of the American Sign Language alphabet. Identify
which letter (A-Z) the hand shape represents.

Be strict — only return a letter when you are confident. If the hand is mid-
motion, occluded, or ambiguous between two letters, set letter to null.
Common confusions to watch for: A vs S vs T (closed-fist variants), M vs N vs
T (thumb position), G vs H vs P vs Q (horizontal pointers), U vs V vs R (two-
finger variants), I vs J (J is motion-only), D vs Z (Z is motion-only), F vs 9.

Reply with ONLY a single JSON object on one line:
{"letter":"A"|"B"|...|"Z"|null,"confidence":0.0-1.0,"reason":"<one short sentence>"}`;

export type AslVisionResult = {
  letter: string | null; // single uppercase A-Z, or null
  confidence: number;    // 0..1
  reason: string;
  rawModel: string;
};

export async function recogniseAslLetter(imageDataUrl: string): Promise<AslVisionResult> {
  if (!hasZaiKeys()) {
    return {
      letter: null,
      confidence: 0,
      reason: "[mock] no Z.AI keys configured — set ZAI_API_KEY or ZAI_API_KEYS in .env.local.",
      rawModel: "mock",
    };
  }
  try {
    const { raw, model } = await withZai(
      async (client, model) => {
        const res = await client.chat.completions.create({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: [
                { type: "text", text: "Identify the ASL letter and reply with the strict JSON." },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ] as any,
            },
          ],
        });
        return { raw: res.choices?.[0]?.message?.content ?? "", model };
      },
      { vision: true }
    );
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) {
      return { letter: null, confidence: 0, reason: `non-JSON: ${raw.slice(0, 80)}`, rawModel: model };
    }
    const obj = JSON.parse(m[0]);
    let letter: string | null = null;
    if (typeof obj.letter === "string" && /^[A-Z]$/i.test(obj.letter)) {
      letter = obj.letter.toUpperCase();
    }
    const confidence = clamp01(obj.confidence);
    return {
      letter,
      confidence,
      reason: typeof obj.reason === "string" ? obj.reason.slice(0, 200) : "",
      rawModel: model,
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if ((e as any)?.code === "ZAI_POOL_EXHAUSTED") {
      return {
        letter: null,
        confidence: 0,
        reason: "All Z.AI keys are cooling down — try again in a few minutes.",
        rawModel: "pool-exhausted",
      };
    }
    return { letter: null, confidence: 0, reason: msg, rawModel: "error" };
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
