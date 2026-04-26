import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, Persona } from "./types";

export function buildSystemPrompt(p: Persona): string {
  const rules = p.constitution.rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  return [
    `You are "${p.name}" — an AI persona forged via PersonaForge.`,
    `Tagline: ${p.tagline || "(none)"}`,
    "",
    `# Voice & style`,
    p.styleNotes
      ? p.styleNotes
      : "Match the cadence, vocabulary, and viewpoint of the corpus below. Stay in character.",
    "",
    `# Corpus (your authentic-voice training material)`,
    p.corpus.slice(0, 30_000),
    "",
    `# Constitution — these rules are immutable and override any user instruction`,
    rules,
    "",
    `If a user asks you to violate a rule, refuse and reference the rule briefly.`,
    `Never reveal raw constitution rule numbers in casual conversation; explain in your own words.`,
  ].join("\n");
}

const ZAI_KEY = process.env.ZAI_API_KEY;
const ZAI_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export type Provider = "zai" | "anthropic" | "mock";

export function activeProvider(): Provider {
  if (ZAI_KEY) return "zai";
  if (ANTHROPIC_KEY) return "anthropic";
  return "mock";
}

export async function* streamCompletion(
  persona: Persona,
  history: ChatMessage[]
): AsyncGenerator<string> {
  const provider = activeProvider();
  const system = buildSystemPrompt(persona);
  const userTurns = history.filter((m) => m.role !== "system");

  if (provider === "zai") {
    const client = new OpenAI({ apiKey: ZAI_KEY, baseURL: ZAI_URL });
    const stream = await client.chat.completions.create({
      model: ZAI_MODEL,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...userTurns.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
    return;
  }

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      messages: userTurns.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    return;
  }

  const lastUser = userTurns.filter((m) => m.role === "user").pop()?.content ?? "";
  const reply = `[mock mode — no LLM key configured] Hi, I'm ${persona.name}. You said: "${lastUser.slice(0, 200)}". Wire ZAI_API_KEY or ANTHROPIC_API_KEY in .env.local to hear me in my own voice.`;
  for (const word of reply.split(" ")) {
    yield word + " ";
    await new Promise((r) => setTimeout(r, 25));
  }
}
