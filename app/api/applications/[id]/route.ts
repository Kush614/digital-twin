import { NextRequest, NextResponse } from "next/server";
import { getApplication, saveApplication } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ application: app });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
  const patch = await req.json();
  const merged = { ...app, ...patch, id: app.id, slug: app.slug };
  await saveApplication(merged);
  return NextResponse.json({ application: merged });
}
