import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApplication, listApplications } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  projectName: z.string().min(1).max(100),
  category: z.string().min(1).max(60),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).or(z.string().length(0)).optional(),
  githubUrl: z.string().url(),
  pitch: z.string().min(20).max(8000),
  inputMode: z.enum(["voice", "text", "symbol", "gesture", "gaze", "image"]),
  visionEvidence: z
    .object({
      source: z.enum(["upload", "screen", "camera", "video"]),
      description: z.string(),
      claimsVisible: z.array(z.string()),
      technicalSignals: z.array(z.string()),
      syntheticConfidence: z.number().min(0).max(1),
      rawModel: z.string().optional(),
      frameCount: z.number().int().min(0).max(8).optional(),
      transcript: z.string().max(4000).optional(),
      frames: z.array(z.string().startsWith("data:image/").max(8 * 1024 * 1024)).max(8).optional(),
      fetchedAt: z.number(),
    })
    .optional(),
  faceDescriptor: z
    .object({
      vector: z.array(z.number()).max(256),
      livenessChecks: z.object({ blink: z.boolean(), turn: z.boolean() }),
      capturedAt: z.number(),
    })
    .optional(),
});

export async function GET() {
  const apps = await listApplications();
  return NextResponse.json({
    applications: apps.map((a) => ({
      id: a.id,
      slug: a.slug,
      projectName: a.projectName,
      category: a.category,
      githubUrl: a.githubUrl,
      inputMode: a.inputMode,
      totalScore: a.totalScore ?? null,
      fraudFlagCount: a.fraudFlags?.length ?? 0,
      attestationUid: a.attestationUid ?? null,
      createdAt: a.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const app = await createApplication({
    projectName: parsed.data.projectName,
    category: parsed.data.category,
    walletAddress: parsed.data.walletAddress ?? "",
    githubUrl: parsed.data.githubUrl,
    pitch: parsed.data.pitch,
    inputMode: parsed.data.inputMode,
    visionEvidence: parsed.data.visionEvidence,
    faceDescriptor: parsed.data.faceDescriptor,
  });
  return NextResponse.json({ application: app });
}
