import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApplication, saveApplication } from "@/lib/store";
import { attestApplication } from "@/lib/eas";

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
  if (app.totalScore === undefined) {
    return NextResponse.json({ error: "evaluate before attesting" }, { status: 400 });
  }
  try {
    const result = await attestApplication(app);
    const updated = {
      ...app,
      attestationUid: result.uid,
      attestationTxHash: result.txHash,
      attestationChain: result.chain,
    };
    await saveApplication(updated);
    return NextResponse.json({ application: updated, mock: result.mock });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "attest failed" }, { status: 500 });
  }
}
