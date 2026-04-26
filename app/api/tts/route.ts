import { NextRequest } from "next/server";
import { z } from "zod";
import { getPersona } from "@/lib/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  personaId: z.string().min(1),
  text: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const persona = await getPersona(parsed.data.personaId);
  if (!persona) {
    return new Response(JSON.stringify({ error: "persona not found" }), { status: 404 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId =
    persona.voiceId || process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

  if (!apiKey) {
    return new Response(
      JSON.stringify({ fallback: "browser-tts", reason: "no ELEVENLABS_API_KEY" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: parsed.data.text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.45, similarity_boost: 0.85 },
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "tts upstream error");
    return new Response(JSON.stringify({ fallback: "browser-tts", error: errText }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-cache",
    },
  });
}
