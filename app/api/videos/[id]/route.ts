import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_DIR = path.join(process.cwd(), "data", "videos");
const META_DIR = path.join(process.cwd(), "data", "videos-meta");

async function loadMeta(id: string): Promise<{ ext: string; mime: string; size: number } | null> {
  try {
    const raw = await fs.readFile(path.join(META_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{6,64}$/i.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const meta = await loadMeta(id);
  if (!meta) return NextResponse.json({ error: "not found" }, { status: 404 });
  const filePath = path.join(VIDEO_DIR, `${id}.${meta.ext}`);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    const fh = await fs.open(filePath, "r");
    const buf = Buffer.alloc(chunkSize);
    await fh.read(buf, 0, chunkSize, start);
    await fh.close();
    return new NextResponse(buf, {
      status: 206,
      headers: {
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "accept-ranges": "bytes",
        "content-length": String(chunkSize),
        "content-type": meta.mime || "video/webm",
        "cache-control": "public, max-age=300",
      },
    });
  }

  const buf = await fs.readFile(filePath);
  return new NextResponse(buf, {
    headers: {
      "content-type": meta.mime || "video/webm",
      "content-length": String(stat.size),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=300",
    },
  });
}
