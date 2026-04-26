import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPersona, listPersonas } from "@/lib/persona";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().max(160).default(""),
  corpus: z.string().min(1).max(60_000),
  styleNotes: z.string().max(2_000).optional(),
  constitutionRules: z.array(z.string().max(280)).max(20).optional(),
  contributors: z
    .array(
      z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        share: z.number().int().min(1).max(10_000),
        label: z.string().max(60).optional(),
      })
    )
    .optional(),
});

export async function GET() {
  const personas = await listPersonas();
  return NextResponse.json({
    personas: personas.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      createdAt: p.createdAt,
      tokenId: p.tokenId ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const persona = await createPersona(parsed.data);
  return NextResponse.json({ persona });
}
