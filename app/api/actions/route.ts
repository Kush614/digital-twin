import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPersona } from "@/lib/persona";
import { gateAction, type AgentAction } from "@/lib/openclaw";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dao.vote"),
    daoAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    proposalId: z.string().min(1).max(120),
    choice: z.enum(["for", "against", "abstain"]),
    rationale: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("tx.send"),
    to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    valueWei: z.string().regex(/^\d+$/),
    data: z.string().optional(),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("message.post"),
    channel: z.string().min(1).max(120),
    body: z.string().min(1).max(2000),
  }),
]);

const Body = z.object({
  personaId: z.string().min(1),
  action: ActionSchema,
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const persona = await getPersona(parsed.data.personaId);
  if (!persona) return NextResponse.json({ error: "persona not found" }, { status: 404 });

  const verdict = await gateAction(persona, parsed.data.action as AgentAction);
  if (!verdict.allowed) {
    return NextResponse.json({ verdict, executed: false });
  }

  // Execution stub — in production this would dispatch to OpenClaw / a wallet.
  // For the demo we return a structured "intent" the user/agent can take to a
  // signer (e.g. Safe, governance UI). This keeps the action layer auditable.
  const intent = {
    personaId: persona.id,
    issuedAt: new Date().toISOString(),
    action: parsed.data.action,
    constitutionHash: hashConstitution(persona.constitution.rules),
  };

  return NextResponse.json({ verdict, executed: true, intent });
}

function hashConstitution(rules: string[]): string {
  // FNV-1a over joined rules — cheap, deterministic, good enough for display
  let h = 2166136261n;
  const s = rules.join("\n");
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 16777619n) & 0xffffffffn;
  }
  return "0x" + h.toString(16).padStart(8, "0");
}
