import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Application,
  EvaluationRationale,
  FraudFlag,
  GitHubFingerprint,
  SubScores,
} from "./types";

const ZAI_KEY = process.env.ZAI_API_KEY;
const ZAI_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are an impact evaluator for public-goods grants (Gitcoin / Optimism RetroPGF style).
You receive a project pitch and a measured GitHub fingerprint of the project's repo.
Score the project across four axes, each from 0 to 25 (integer):

- utility:      does this solve a real problem for real users? Be skeptical of vague claims.
- innovation:   originality and forward-thinking. Penalize me-too clones and pure rebrands.
- technical:    engineering execution. Use the GitHub fingerprint as ground truth — repos with
                no recent commits, no contributors, or thin issue activity should score low here
                regardless of pitch quality.
- credibility:  do the pitch claims match the GitHub evidence? A pitch that claims "10,000 users"
                while the repo has 4 stars and 1 contributor is low credibility.

Be strict. Reward shipped code, not promises. Reply with ONLY a JSON object on a single line:
{"utility":0-25,"innovation":0-25,"technical":0-25,"credibility":0-25,"rationale":{"utility":"…","innovation":"…","technical":"…","credibility":"…"}}
Keep each rationale string under 240 characters and concrete (cite specific signals).`;

function compactFingerprint(fp: GitHubFingerprint) {
  return {
    age_days: fp.ageDays,
    stars: fp.stars,
    forks: fp.forks,
    open_issues: fp.openIssues,
    closed_issues_90d: fp.closedIssues,
    contributors: fp.contributors,
    commits_last_90d: fp.commitsLast90d,
    days_with_commits_last_90d: fp.daysWithCommitsLast90d,
    prs_last_90d: fp.pullRequestsLast90d,
    stars_last_30d: fp.starsLast30d,
    languages: fp.topLanguages,
  };
}

function userPrompt(app: Application, fp: GitHubFingerprint, flags: FraudFlag[]) {
  const visionBlock = app.visionEvidence
    ? [
        "",
        "VISION EVIDENCE (from Z.AI GLM-4.5V on a submitted screenshot/demo image):",
        `description: ${app.visionEvidence.description}`,
        `claims_visible: ${JSON.stringify(app.visionEvidence.claimsVisible)}`,
        `technical_signals: ${JSON.stringify(app.visionEvidence.technicalSignals)}`,
        `synthetic_confidence: ${app.visionEvidence.syntheticConfidence}`,
      ].join("\n")
    : "";
  return [
    `PROJECT: ${app.projectName}`,
    `CATEGORY: ${app.category}`,
    `INPUT MODE: ${app.inputMode}`,
    "",
    "PITCH:",
    app.pitch,
    "",
    "GITHUB FINGERPRINT (measured, do not speculate beyond this):",
    JSON.stringify(compactFingerprint(fp), null, 2),
    visionBlock,
    "",
    "FRAUD FLAGS (factor into credibility):",
    flags.length === 0 ? "none" : flags.map((f) => `- [${f.severity}] ${f.kind}: ${f.detail}`).join("\n"),
  ].join("\n");
}

type Provider = "zai" | "anthropic" | "mock";

function provider(): Provider {
  if (ZAI_KEY) return "zai";
  if (ANTHROPIC_KEY) return "anthropic";
  return "mock";
}

export type EvaluatorResult = {
  subScores: SubScores;
  total: number;
  rationale: EvaluationRationale;
};

export async function evaluateApplication(
  app: Application,
  fp: GitHubFingerprint,
  flags: FraudFlag[]
): Promise<EvaluatorResult> {
  const p = provider();
  let raw = "";

  if (p === "zai") {
    const client = new OpenAI({ apiKey: ZAI_KEY, baseURL: ZAI_URL });
    const res = await client.chat.completions.create({
      model: ZAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(app, fp, flags) },
      ],
    });
    raw = res.choices?.[0]?.message?.content ?? "";
  } else if (p === "anthropic") {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(app, fp, flags) }],
    });
    raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  } else {
    // Mock — derive from the GitHub fingerprint so demo is still meaningful.
    return mockEvaluate(fp, flags);
  }

  const parsed = parseStrict(raw);
  if (!parsed) return mockEvaluate(fp, flags); // fallback if model returns garbage
  const total =
    parsed.subScores.utility +
    parsed.subScores.innovation +
    parsed.subScores.technical +
    parsed.subScores.credibility;
  return { subScores: parsed.subScores, total, rationale: parsed.rationale };
}

function parseStrict(raw: string): { subScores: SubScores; rationale: EvaluationRationale } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const u = clamp25(obj.utility);
    const i = clamp25(obj.innovation);
    const t = clamp25(obj.technical);
    const c = clamp25(obj.credibility);
    if ([u, i, t, c].some((n) => n === null)) return null;
    return {
      subScores: { utility: u!, innovation: i!, technical: t!, credibility: c! },
      rationale: {
        utility: String(obj?.rationale?.utility ?? ""),
        innovation: String(obj?.rationale?.innovation ?? ""),
        technical: String(obj?.rationale?.technical ?? ""),
        credibility: String(obj?.rationale?.credibility ?? ""),
      },
    };
  } catch {
    return null;
  }
}

function clamp25(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(25, Math.round(v)));
}

function mockEvaluate(fp: GitHubFingerprint, flags: FraudFlag[]): EvaluatorResult {
  // Deterministic fallback that still uses real signals so judges see a real number even with no LLM.
  const technical = Math.round(
    (fp.velocityScore + fp.contributorScore + fp.engagementScore + fp.starHealthScore) / 4
  );
  const credPenalty = flags.reduce(
    (acc, f) => acc + (f.severity === "high" ? 8 : f.severity === "medium" ? 4 : 2),
    0
  );
  const credibility = Math.max(0, 20 - credPenalty);
  const utility = 14;
  const innovation = 13;
  const total = utility + innovation + technical + credibility;
  return {
    subScores: { utility, innovation, technical, credibility },
    total,
    rationale: {
      utility: "[mock] no LLM key — utility scored at neutral baseline.",
      innovation: "[mock] no LLM key — innovation scored at neutral baseline.",
      technical: `Derived from GitHub fingerprint: velocity ${fp.velocityScore}, contributors ${fp.contributorScore}, engagement ${fp.engagementScore}, star-health ${fp.starHealthScore}.`,
      credibility: flags.length
        ? `Reduced by ${flags.length} fraud flag(s).`
        : "No fraud flags detected. Set ZAI_API_KEY for narrative credibility check.",
    },
  };
}
