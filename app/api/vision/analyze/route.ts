import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeImage } from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  imageDataUrl: z
    .string()
    .startsWith("data:image/")
    .max(8 * 1024 * 1024), // ~8MB raw; keeps the route honest
  source: z.enum(["upload", "screen", "camera"]).default("upload"),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const evidence = await analyzeImage(parsed.data.imageDataUrl, parsed.data.source);
  return NextResponse.json({ evidence });
}
