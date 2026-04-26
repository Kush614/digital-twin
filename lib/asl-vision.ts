import { hasZaiKeys, withZai } from "./zai";

const SENTENCE_SYSTEM = `You are a professional sign-language interpreter and translator.
You will receive a chronologically-ordered set of keyframes from a short video
of someone signing. Your job is to produce the **English sentence** the signer
is communicating — not a list of letters.

Detect what mode is being used:
- "fingerspelling" — hand shapes are the ASL alphabet, signer is spelling a word
  letter by letter
- "asl-signs" — full ASL signs / gloss (movement-based signs that map to whole
  words or concepts)
- "mixed" — both fingerspelling and signs, or fingerspelling proper nouns inside
  signed sentences
- "unclear" — frames are too noisy / partial / not actually signing

Then produce:
- the most likely English sentence (or short phrase). If it is fingerspelling,
  collapse the letters into the word(s). If it is ASL signs, translate to fluent
  English (not gloss).
- a "gloss" array — your best guess at what each frame was, in order. Use letters
  for fingerspelled frames and ALL_CAPS gloss labels for signs (e.g. "HELLO",
  "NAME", "THANK_YOU"). Use null for frames that didn't carry a sign.
- confidence in [0,1]

Reply with ONLY a single JSON object:
{"sentence":"...","mode":"fingerspelling"|"asl-signs"|"mixed"|"unclear","gloss":["A","B",null,...],"confidence":0.0,"notes":"<one short sentence>"}`;

export type AslSentenceResult = {
  sentence: string;
  mode: "fingerspelling" | "asl-signs" | "mixed" | "unclear";
  gloss: (string | null)[];
  confidence: number;
  notes: string;
  rawModel: string;
};

export async function transcribeAslVideo(frames: string[]): Promise<AslSentenceResult> {
  if (!hasZaiKeys()) {
    return {
      sentence: "",
      mode: "unclear",
      gloss: [],
      confidence: 0,
      notes: "[mock] no Z.AI keys configured",
      rawModel: "mock",
    };
  }
  if (frames.length === 0) {
    return {
      sentence: "",
      mode: "unclear",
      gloss: [],
      confidence: 0,
      notes: "no frames provided",
      rawModel: "no-input",
    };
  }
  try {
    const { raw, model } = await withZai(
      async (client, model) => {
        const res = await client.chat.completions.create({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: SENTENCE_SYSTEM },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Translate the sign-language sequence in these ${frames.length} chronological keyframes. Reply with the strict JSON.`,
                },
                ...frames.map((url) => ({
                  type: "image_url" as const,
                  image_url: { url },
                })),
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
      return {
        sentence: "",
        mode: "unclear",
        gloss: [],
        confidence: 0,
        notes: `non-JSON: ${raw.slice(0, 80)}`,
        rawModel: model,
      };
    }
    const obj = JSON.parse(m[0]);
    return {
      sentence: typeof obj.sentence === "string" ? obj.sentence.trim().slice(0, 400) : "",
      mode: ["fingerspelling", "asl-signs", "mixed", "unclear"].includes(obj.mode)
        ? obj.mode
        : "unclear",
      gloss: Array.isArray(obj.gloss)
        ? obj.gloss.slice(0, 64).map((g: any) => (typeof g === "string" ? g : null))
        : [],
      confidence: clamp01(obj.confidence),
      notes: typeof obj.notes === "string" ? obj.notes.slice(0, 200) : "",
      rawModel: model,
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if ((e as any)?.code === "ZAI_POOL_EXHAUSTED") {
      return {
        sentence: "",
        mode: "unclear",
        gloss: [],
        confidence: 0,
        notes: "All Z.AI keys cooling down — try again in a minute.",
        rawModel: "pool-exhausted",
      };
    }
    return {
      sentence: "",
      mode: "unclear",
      gloss: [],
      confidence: 0,
      notes: msg.slice(0, 200),
      rawModel: "error",
    };
  }
}

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
