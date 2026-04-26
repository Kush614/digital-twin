import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApplication, listApplications, saveApplication } from "@/lib/store";
import { fetchFingerprint } from "@/lib/github";
import { detectFraudSignals } from "@/lib/fraud";
import { detectDuplicateFace } from "@/lib/face";
import { evaluateApplication } from "@/lib/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ applicationId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const app = await getApplication(parsed.data.applicationId);
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

  let fp;
  try {
    fp = await fetchFingerprint(app.githubUrl);
  } catch (e: any) {
    return NextResponse.json({ error: `github: ${e?.message}` }, { status: 502 });
  }

  const flags = detectFraudSignals(app, fp);
  const others = (await listApplications()).filter((a) => a.id !== app.id);
  const dup = detectDuplicateFace(app, others);
  if (dup) flags.push(dup);
  const result = await evaluateApplication(app, fp, flags);

  const updated = {
    ...app,
    fingerprint: fp,
    fraudFlags: flags,
    subScores: result.subScores,
    totalScore: result.total,
    rationale: result.rationale,
    evaluatedAt: Date.now(),
  };
  await saveApplication(updated);
  return NextResponse.json({ application: updated });
}
