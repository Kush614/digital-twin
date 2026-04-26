import Link from "next/link";
import { listApplications } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const apps = await listApplications();
  const evaluated = apps.filter((a) => a.totalScore !== undefined);
  const flagged = apps.filter((a) => (a.fraudFlags?.length ?? 0) > 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <span className="tag">2026 BETA Hackathon</span>
          <span className="tag">Crypto & Agents · GCC</span>
          <span className="tag">Voice & Vision</span>
          <span className="tag">AI Native</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight bg-gradient-to-br from-white via-accent2 to-accent bg-clip-text text-transparent">
          ImpactLens
        </h1>
        <p className="mt-2 text-lg md:text-xl text-white/70 max-w-3xl">
          Every builder deserves a fair shot.{" "}
          <span className="text-white/90 font-medium">No voice required. No fakers rewarded.</span>
        </p>
        <p className="mt-3 text-sm text-white/50 max-w-3xl">
          The grant system is broken in two directions at once — it excludes people who can't speak
          well, and it rewards people who fake impact. ImpactLens fixes both: multimodal pitches,
          GitHub-grounded scoring, on-chain attestation.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
        <Stat top="1B+" label="people globally with communication / speech disabilities" />
        <Stat top="$140M+" label="distributed by Gitcoin / Optimism RetroPGF" />
        <Stat top="~30%" label="estimated fraudulent / inflated applications in major rounds" />
        <Stat top="0" label="open-source tools that address both barriers simultaneously" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        <Link
          href="/apply"
          className="glass rounded-2xl p-6 group hover:border-accent/60 border border-white/5 transition"
        >
          <div className="text-xs uppercase tracking-widest text-accent2 mb-2">For builders</div>
          <h2 className="text-2xl font-semibold mb-2">Apply for a grant →</h2>
          <p className="text-white/60 text-sm mb-4">
            Pitch by voice, text, symbol board, or gesture. Your impact is in your code, not your
            charisma.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="tag">🎙 Voice</span>
            <span className="tag">⌨ Text</span>
            <span className="tag">🖼 Symbol board</span>
            <span className="tag">🤟 Gesture</span>
            <span className="tag">👁 Eye gaze</span>
          </div>
        </Link>

        <Link
          href="/review"
          className="glass rounded-2xl p-6 group hover:border-accent/60 border border-white/5 transition"
        >
          <div className="text-xs uppercase tracking-widest text-accent2 mb-2">For reviewers</div>
          <h2 className="text-2xl font-semibold mb-2">Open the reviewer panel →</h2>
          <p className="text-white/60 text-sm mb-4">
            Sorted by composite impact score. GitHub fingerprint visible per application. Fraud
            flags surfaced, not buried.
          </p>
          <div className="text-xs text-white/40">
            {apps.length} application{apps.length === 1 ? "" : "s"} ·{" "}
            {evaluated.length} evaluated · {flagged.length} flagged
          </div>
        </Link>
      </section>

      <section className="mb-12">
        <h3 className="text-sm uppercase tracking-widest text-white/40 mb-3">How fakers get caught</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <FraudCard
            title="Ghost repo"
            detail="50+ stars but <3 commits in 90 days and <3 contributors."
            source="GitHub commits / contributors"
          />
          <FraudCard
            title="Star spike"
            detail="More than 60% of stars accumulated in the last 30 days."
            source="GitHub stargazers timeline"
          />
          <FraudCard
            title="AI-generated pitch"
            detail="3+ LLM-typical phrases ('leverage', 'cutting-edge', 'unlock potential')."
            source="Lexical heuristic"
          />
          <FraudCard
            title="Thin contributor graph"
            detail='Pitch references "we"/"team" but the repo has 1 contributor.'
            source="GitHub contributors vs. pitch"
          />
          <FraudCard
            title="Brand-new + viral"
            detail="Repo created <14 days ago but already has 100+ stars."
            source="GitHub created_at vs. star count"
          />
          <FraudCard
            title="Credibility check"
            detail="LLM cross-references pitch claims against GitHub evidence."
            source="Z.AI / Anthropic"
          />
        </div>
      </section>

      <footer className="text-xs text-white/40 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-6">
        <span>Built in one day at Frontier Tower, San Francisco · 2026 BETA Hackathon</span>
        <span>
          Powered by Z.AI · GitHub API · EAS · Open-source MIT for GCC OpenClaw track
        </span>
      </footer>
    </main>
  );
}

function Stat({ top, label }: { top: string; label: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-3xl font-bold bg-gradient-to-br from-white to-accent2 bg-clip-text text-transparent">
        {top}
      </div>
      <div className="mt-1 text-[11px] text-white/50 leading-snug">{label}</div>
    </div>
  );
}

function FraudCard({ title, detail, source }: { title: string; detail: string; source: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="font-semibold text-white/90 mb-1">{title}</div>
      <div className="text-white/60 leading-snug">{detail}</div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-accent2">{source}</div>
    </div>
  );
}
