import { NextRequest, NextResponse } from "next/server";
import { getPersona, savePersona } from "@/lib/persona";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await getPersona(id);
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ persona });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await getPersona(id);
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });
  const patch = await req.json();
  const merged = { ...persona, ...patch, id: persona.id, slug: persona.slug };
  await savePersona(merged);
  return NextResponse.json({ persona: merged });
}
