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

const VIDEO_SYSTEM = `You are an evidence extractor for a public-goods grant evaluator.
You will receive 4-6 keyframes sampled chronologically from a short pitch video
(applicant facing camera, signing, demoing software, or showing hardware). You
may also receive a SPOKEN_TRANSCRIPT block — the speech-to-text of the audio
track, if any. Your job is to summarise the *whole video* — what changes
between frames, what the person is showing, whether they are using sign
language, and whether the spoken words match what's on screen.

1. describe the overall content (treating frames as a sequence + integrating
   the transcript when present),
2. extract discrete claims a reviewer could cross-check against the written
   pitch — pull quotable lines from the transcript when relevant,
3. note technical signals: software shown, hardware shown, sign-language usage,
   spoken-cues, demo realism, transcript-vs-visual alignment,
4. estimate the probability the video is AI-generated / deepfake / stitched.

If the transcript is present and substantive, weight it as primary evidence.
If the person is signing and the transcript is empty, that is normal and
expected — say so in technicalSignals as a positive signal for accessibility.

Reply with ONLY a single JSON object:

{"description":"…","claimsVisible":["…"],"technicalSignals":["…"],"syntheticConfidence":0.0}

Description ≤ 320 characters, each claim ≤ 100 characters,
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

export async function analyzeVideoFrames(
  frames: string[],
  transcript?: string
): Promise<VisionEvidence> {
  if (!hasZaiKeys()) {
    return mockAnalyze("video", undefined);
  }
  if (frames.length === 0) {
    return mockAnalyze("video", "no frames extracted");
  }
  const transcriptBlock = transcript && transcript.trim().length > 0
    ? `\n\nSPOKEN_TRANSCRIPT:\n${transcript.trim().slice(0, 1500)}`
    : "\n\nSPOKEN_TRANSCRIPT: (empty — applicant may be signing or recorded silently)";
  try {
    const { raw, model } = await withZai(
      async (client, model) => {
        const res = await client.chat.completions.create({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: VIDEO_SYSTEM },
            {
              role: "user",
              content: [
                { type: "text", text: `Analyse these ${frames.length} chronologically-ordered keyframes from a short pitch video. Reply with the strict JSON.${transcriptBlock}` },
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
    const parsed = parseStrict(raw);
    if (!parsed) return mockAnalyze("video", "model returned non-JSON");
    return {
      source: "video",
      description: parsed.description,
      claimsVisible: parsed.claimsVisible,
      technicalSignals: parsed.technicalSignals,
      syntheticConfidence: parsed.syntheticConfidence,
      rawModel: model,
      frameCount: frames.length,
      fetchedAt: Date.now(),
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if ((e as any)?.code === "ZAI_POOL_EXHAUSTED") {
      return mockAnalyze("video", "All Z.AI keys cooling down — try again shortly.");
    }
    return mockAnalyze("video", msg);
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
