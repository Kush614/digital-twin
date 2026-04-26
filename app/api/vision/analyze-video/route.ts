import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeVideoFrames } from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  frames: z
    .array(z.string().startsWith("data:image/").max(8 * 1024 * 1024))
    .min(1)
    .max(8),
  transcript: z.string().max(4000).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const evidence = await analyzeVideoFrames(parsed.data.frames, parsed.data.transcript);
  return NextResponse.json({ evidence });
}
