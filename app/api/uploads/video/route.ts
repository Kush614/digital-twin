import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { v4 as uuid } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_DIR = path.join(process.cwd(), "data", "videos");
const META_DIR = path.join(process.cwd(), "data", "videos-meta");
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard cap

function extFor(mime: string): string {
  if (mime.startsWith("video/webm")) return "webm";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  return "bin";
}

export async function POST(req: NextRequest) {
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  await fs.mkdir(META_DIR, { recursive: true });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, { status: 413 });
  }
  const id = uuid();
  const mime = (file.type || "video/webm").toLowerCase();
  const ext = extFor(mime);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(VIDEO_DIR, `${id}.${ext}`), buffer);
  await fs.writeFile(
    path.join(META_DIR, `${id}.json`),
    JSON.stringify({ id, ext, mime, size: file.size, savedAt: Date.now() })
  );
  return NextResponse.json({
    id,
    mime,
    size: file.size,
    url: `/api/videos/${id}`,
  });
}
