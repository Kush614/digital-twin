import type { Application, FraudFlag, GitHubFingerprint } from "./types";

// Heuristic-only fraud detection. Stays cheap and explainable — every flag has
// a concrete signal a reviewer can verify by hand.
export function detectFraudSignals(app: Application, fp: GitHubFingerprint): FraudFlag[] {
  const flags: FraudFlag[] = [];

  // 1. Ghost repo: many stars, no recent activity, few contributors
  if (fp.stars >= 50 && fp.commitsLast90d < 3 && fp.contributors < 3) {
    flags.push({
      kind: "ghost-repo",
      severity: "high",
      detail: `${fp.stars} stars but only ${fp.commitsLast90d} commits in 90d and ${fp.contributors} contributors.`,
    });
  }

  // 2. Star-spike: large fraction of stars accumulated in last 30 days
  if (fp.stars >= 50 && fp.starsLast30d / fp.stars > 0.6) {
    flags.push({
      kind: "star-spike",
      severity: "medium",
      detail: `${fp.starsLast30d}/${fp.stars} stars (${Math.round(
        (fp.starsLast30d / fp.stars) * 100
      )}%) appeared in the last 30 days.`,
    });
  }

  // 3. Thin contributor graph: solo author claiming team-scale impact
  if (fp.contributors <= 1 && wordCount(app.pitch) > 80 && /\bteam\b|\bwe\b/i.test(app.pitch)) {
    flags.push({
      kind: "thin-contributor-graph",
      severity: "low",
      detail: `Pitch refers to a team but the repo has ${fp.contributors} contributor(s).`,
    });
  }

  // 4. AI-generated pitch heuristic — opening clichés + LLM-typical phrases
  if (looksAiGenerated(app.pitch)) {
    flags.push({
      kind: "ai-generated-pitch",
      severity: "medium",
      detail:
        "Pitch contains multiple LLM-typical phrasings ('in today's rapidly evolving', 'leverage', 'cutting-edge', 'unlock'). A human review is recommended.",
    });
  }

  // 5. Recycled / brand-new repo pattern
  if (fp.ageDays < 14 && fp.stars > 100) {
    flags.push({
      kind: "ghost-repo",
      severity: "high",
      detail: `Repo created ${fp.ageDays} day(s) ago but already has ${fp.stars} stars.`,
    });
  }

  // 6. Synthetic image — Z.AI GLM-4.5V flagged the submitted screenshot/demo
  if (app.visionEvidence && app.visionEvidence.syntheticConfidence >= 0.6) {
    flags.push({
      kind: "synthetic-image",
      severity: app.visionEvidence.syntheticConfidence >= 0.8 ? "high" : "medium",
      detail: `Vision model rated submitted image ${(
        app.visionEvidence.syntheticConfidence * 100
      ).toFixed(0)}% likely synthetic / AI-generated.`,
    });
  }

  return flags;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const AI_TELLS = [
  /in today's (rapidly|fast)?\s*evolving/i,
  /leverage(s|d|)\b/i,
  /cutting[-\s]edge/i,
  /unlock(s|ed)?\s+(the\s+)?(power|potential|future)/i,
  /seamlessly\s+integrate/i,
  /at the forefront of/i,
  /revolutioniz(e|ing|es|ed)/i,
  /game[-\s]chang(er|ing)/i,
  /paradigm\s+shift/i,
  /robust\s+and\s+scalable/i,
  /empower(s|ing|ed)?\s+users?/i,
];

function looksAiGenerated(text: string): boolean {
  let hits = 0;
  for (const re of AI_TELLS) if (re.test(text)) hits++;
  return hits >= 3;
}
