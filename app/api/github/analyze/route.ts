import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchFingerprint } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ repoUrl: z.string().url() });

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const fp = await fetchFingerprint(parsed.data.repoUrl);
    return NextResponse.json({ fingerprint: fp });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "fetch failed" }, { status: 502 });
  }
}
