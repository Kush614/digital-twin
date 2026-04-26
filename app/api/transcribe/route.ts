import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { asrModel, hasZaiKeys, nextZaiKey, reportKeyResult, zaiBaseUrl } from "@/lib/zai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_DIR = path.join(process.cwd(), "data", "videos");
const META_DIR = path.join(process.cwd(), "data", "videos-meta");

const Body = z.object({
  videoUrl: z.string().min(1),
});

async function loadFromVideoUrl(videoUrl: string): Promise<{ buf: Buffer; mime: string; ext: string } | null> {
  // Accept relative URLs like "/api/videos/<id>" — read directly from disk.
  const m = videoUrl.match(/\/api\/videos\/([a-f0-9-]+)/i);
  if (!m) return null;
  const id = m[1];
  try {
    const meta = JSON.parse(await fs.readFile(path.join(META_DIR, `${id}.json`), "utf-8"));
    const buf = await fs.readFile(path.join(VIDEO_DIR, `${id}.${meta.ext}`));
    return { buf, mime: meta.mime || "video/webm", ext: meta.ext };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!hasZaiKeys()) {
    return NextResponse.json({ transcript: "", reason: "no Z.AI keys" }, { status: 200 });
  }
  const file = await loadFromVideoUrl(parsed.data.videoUrl);
  if (!file) {
    return NextResponse.json({ transcript: "", reason: "video not found" }, { status: 200 });
  }

  // Try up to 4 keys in order; cooldown logic shared with the chat pool.
  const errors: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const ctx = nextZaiKey();
    if (!ctx) break;
    const fd = new FormData();
    fd.append(
      "file",
      new Blob([new Uint8Array(file.buf)], { type: file.mime }),
      `pitch.${file.ext}`
    );
    fd.append("model", asrModel());
    try {
      const r = await fetch(`${ctx.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${ctx.key}` },
        body: fd,
      });
      const text = await r.text();
      if (!r.ok) {
        errors.push(`${r.status}: ${text.slice(0, 120)}`);
        reportKeyResult(ctx.key, false, `${r.status} ${text.slice(0, 120)}`);
        // 4xx that aren't 429: stop — endpoint or model probably wrong, not a key issue
        if (r.status !== 429 && r.status < 500) break;
        continue;
      }
      reportKeyResult(ctx.key, true);
      // OpenAI-compatible response: {"text": "..."}; some Z.AI deployments return {"data": {"text": "..."}}
      try {
        const obj = JSON.parse(text);
        const t = obj?.text ?? obj?.data?.text ?? obj?.transcript ?? "";
        return NextResponse.json({ transcript: String(t).trim(), source: "server" });
      } catch {
        return NextResponse.json({ transcript: text.trim().slice(0, 4000), source: "server" });
      }
    } catch (e: any) {
      errors.push(e?.message ?? "fetch failed");
      reportKeyResult(ctx.key, false, e?.message);
    }
  }
  return NextResponse.json(
    { transcript: "", reason: `ASR unavailable: ${errors.join(" | ").slice(0, 200)}` },
    { status: 200 }
  );
}
