import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recogniseAslLetter } from "@/lib/asl-vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  imageDataUrl: z
    .string()
    .startsWith("data:image/")
    .max(8 * 1024 * 1024),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await recogniseAslLetter(parsed.data.imageDataUrl);
  return NextResponse.json({ result });
}
