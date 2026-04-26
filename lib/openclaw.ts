import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Persona } from "./types";

export type AgentAction =
  | { kind: "dao.vote"; daoAddress: string; proposalId: string; choice: "for" | "against" | "abstain"; rationale?: string }
  | { kind: "tx.send"; to: string; valueWei: string; data?: string; reason?: string }
  | { kind: "message.post"; channel: string; body: string };

export type Verdict = {
  allowed: boolean;
  reason: string;
  citedRule?: string;
};

const ZAI_KEY = process.env.ZAI_API_KEY;
const ZAI_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

function quickRuleChecks(persona: Persona, action: AgentAction): Verdict | null {
  if (action.kind === "tx.send") {
    const cap = persona.constitution.spendCapWei;
    if (cap) {
      try {
        if (BigInt(action.valueWei) > BigInt(cap)) {
          return {
            allowed: false,
            reason: `Action exceeds the persona's on-chain spend cap (${cap} wei).`,
            citedRule: "spendCapWei",
          };
        }
      } catch {}
    }
  }
  if (action.kind === "dao.vote") {
    const allowed = persona.constitution.allowedDaos;
    if (allowed && allowed.length > 0) {
      const ok = allowed.map((a) => a.toLowerCase()).includes(action.daoAddress.toLowerCase());
      if (!ok) {
        return {
          allowed: false,
          reason: `DAO ${action.daoAddress} is not on the persona's allowedDaos list.`,
          citedRule: "allowedDaos",
        };
      }
    }
  }
  return null;
}

const VERDICT_INSTRUCTIONS = `You are the constitutional gate for an AI persona. You will receive:
1) The persona's full constitution (an immutable list of rules).
2) A single proposed action the persona is about to take.

Your job: decide whether executing this action would violate any rule.
Reply with ONLY a single JSON object on one line:
{"allowed": true|false, "reason": "<short>", "citedRule": "<rule text or empty>"}
Be strict. If unsure, deny.`;

function buildPrompt(persona: Persona, action: AgentAction): string {
  return [
    "CONSTITUTION:",
    persona.constitution.rules.map((r, i) => `${i + 1}. ${r}`).join("\n"),
    "",
    "PROPOSED ACTION:",
    JSON.stringify(action, null, 2),
  ].join("\n");
}

export async function gateAction(persona: Persona, action: AgentAction): Promise<Verdict> {
  const quick = quickRuleChecks(persona, action);
  if (quick) return quick;

  if (ZAI_KEY) {
    const client = new OpenAI({ apiKey: ZAI_KEY, baseURL: ZAI_URL });
    const res = await client.chat.completions.create({
      model: ZAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: VERDICT_INSTRUCTIONS },
        { role: "user", content: buildPrompt(persona, action) },
      ],
    });
    return parseVerdict(res.choices[0]?.message?.content);
  }
  if (ANTHROPIC_KEY) {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: VERDICT_INSTRUCTIONS,
      messages: [{ role: "user", content: buildPrompt(persona, action) }],
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    return parseVerdict(text);
  }

  // No LLM available — default-deny is the safe stance for an action layer.
  return {
    allowed: false,
    reason: "No LLM key configured for the constitutional gate. Defaulting to deny.",
  };
}

function parseVerdict(raw: string | null | undefined): Verdict {
  if (!raw) return { allowed: false, reason: "Empty verdict from gate model." };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { allowed: false, reason: `Gate returned non-JSON: ${raw.slice(0, 120)}` };
  try {
    const obj = JSON.parse(match[0]);
    return {
      allowed: !!obj.allowed,
      reason: typeof obj.reason === "string" ? obj.reason : "",
      citedRule: typeof obj.citedRule === "string" ? obj.citedRule : undefined,
    };
  } catch {
    return { allowed: false, reason: "Failed to parse gate verdict." };
  }
}
