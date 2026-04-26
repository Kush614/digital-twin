import { NextRequest } from "next/server";
import { z } from "zod";
import { getPersona } from "@/lib/persona";
import { streamCompletion } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  personaId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(40),
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
    return new Response(JSON.stringify({ error: "persona not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const token of streamCompletion(persona, parsed.data.messages)) {
          controller.enqueue(encoder.encode(token));
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(`\n\n[error: ${err?.message ?? "unknown"}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
