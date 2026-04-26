import type { GitHubFingerprint } from "./types";

const GH_BASE = "https://api.github.com";

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "impactlens",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export function parseRepoUrl(url: string): { owner: string; name: string } | null {
  try {
    const u = new URL(url.trim());
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, rawName] = parts;
    const name = rawName.replace(/\.git$/i, "");
    return { owner, name };
  } catch {
    return null;
  }
}

async function gh<T>(path: string): Promise<T> {
  const r = await fetch(`${GH_BASE}${path}`, { headers: authHeaders(), cache: "no-store" });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`GitHub ${r.status} on ${path}: ${body.slice(0, 160)}`);
  }
  return r.json() as Promise<T>;
}

type Repo = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  pushed_at: string;
  language: string | null;
};

type Commit = { commit: { author: { date: string }; message: string }; author: { login: string } | null };
type Contributor = { login: string; contributions: number };
type IssueOrPr = { number: number; state: string; created_at: string; closed_at: string | null; pull_request?: unknown };
type StarRecord = { starred_at: string; user: { login: string; created_at?: string } };
type LangMap = Record<string, number>;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function fetchFingerprint(repoUrl: string): Promise<GitHubFingerprint> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error("Not a github.com repo URL");
  const { owner, name } = parsed;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [repo, commits90, contributors, issues, prs90, langs] = await Promise.all([
    gh<Repo>(`/repos/${owner}/${name}`),
    gh<Commit[]>(`/repos/${owner}/${name}/commits?since=${since}&per_page=100`),
    gh<Contributor[]>(`/repos/${owner}/${name}/contributors?per_page=100&anon=1`),
    gh<IssueOrPr[]>(`/repos/${owner}/${name}/issues?state=all&since=${since}&per_page=100`),
    gh<IssueOrPr[]>(`/repos/${owner}/${name}/pulls?state=all&per_page=100&sort=created&direction=desc`),
    gh<LangMap>(`/repos/${owner}/${name}/languages`),
  ]);

  const created = new Date(repo.created_at);
  const ageDays = daysBetween(created, new Date());

  // Days with at least one commit in last 90d
  const dayKeys = new Set<string>();
  for (const c of commits90) dayKeys.add(c.commit.author.date.slice(0, 10));
  const daysWithCommitsLast90d = dayKeys.size;

  const issuesOnly = issues.filter((i) => !i.pull_request);
  const closed = issuesOnly.filter((i) => i.state === "closed").length;

  const prsRecent = prs90.filter((p) => new Date(p.created_at) >= new Date(since));

  // stars in last 30d — use stargazers list (paginated, accept the limit)
  let starsLast30d = 0;
  try {
    const stars = await fetch(
      `${GH_BASE}/repos/${owner}/${name}/stargazers?per_page=100`,
      {
        headers: { ...authHeaders(), accept: "application/vnd.github.star+json" },
        cache: "no-store",
      }
    ).then((r) => (r.ok ? (r.json() as Promise<StarRecord[]>) : []));
    starsLast30d = stars.filter((s) => new Date(s.starred_at) >= new Date(since30)).length;
  } catch {}

  const topLanguages = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);

  // ---- sub-scores (each 0–25) ----
  // Velocity: ideal = 30+ active days in 90 → full marks; <3 active days → 0.
  const velocityScore = Math.round(clamp(daysWithCommitsLast90d / 30, 0, 1) * 25);

  // Contributor diversity: ideal = 5+ distinct contributors.
  const contributorScore = Math.round(clamp(contributors.length / 5, 0, 1) * 25);

  // Engagement: closed issues + PRs created in 90d, normalised to 30 events.
  const events = closed + prsRecent.length;
  const engagementScore = Math.round(clamp(events / 30, 0, 1) * 25);

  // Star health: penalise repos with stars but no commits or no contributors.
  // Heuristic: ratio of contributors to stars/100 should be ≥ 1, and recent commits should exist.
  const stars = repo.stargazers_count;
  let starHealth = 25;
  if (stars > 50 && contributors.length < 2) starHealth -= 10;
  if (stars > 100 && commits90.length < 3) starHealth -= 10;
  if (ageDays < 14 && stars > 100) starHealth -= 10; // brand-new repo, lots of stars
  if (starsLast30d > stars * 0.5 && stars > 50) starHealth -= 5; // recent spike
  starHealth = clamp(starHealth, 0, 25);

  return {
    repoUrl: `https://github.com/${owner}/${name}`,
    owner,
    name,
    ageDays,
    stars,
    watchers: repo.watchers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    closedIssues: closed,
    contributors: contributors.length,
    commitsLast90d: commits90.length,
    commitsTotal: 0, // not free to count cheaply; left as 0
    daysWithCommitsLast90d,
    pullRequestsLast90d: prsRecent.length,
    starsLast30d,
    topLanguages,
    fetchedAt: Date.now(),
    velocityScore,
    contributorScore,
    engagementScore,
    starHealthScore: starHealth,
  };
}
