import Link from "next/link";
import { listApplications } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const apps = await listApplications();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 flex items-center justify-between text-sm">
        <Link href="/" className="text-white/60 hover:text-white">← ImpactLens</Link>
        <Link href="/apply" className="text-white/60 hover:text-white">Submit application →</Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold">Reviewer panel</h1>
        <p className="text-white/60 mt-1 text-sm">
          Sorted by composite score. Fraud-flagged applications are surfaced, not buried.
        </p>
      </header>

      {apps.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-white/50">
          No applications yet. <Link href="/apply" className="text-accent2 underline">Submit one →</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => {
            const score = a.totalScore ?? null;
            const flags = a.fraudFlags?.length ?? 0;
            return (
              <li key={a.id}>
                <Link
                  href={`/a/${a.slug}`}
                  className="block glass rounded-xl p-4 border border-white/5 hover:border-accent/40 transition"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{a.projectName}</div>
                      <div className="text-xs text-white/50 truncate">
                        {a.category} · {inputModeLabel(a.inputMode)} · {a.githubUrl}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {flags > 0 && (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full border"
                          style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.1)", color: "#fbbf24" }}
                        >
                          ⚠ {flags}
                        </span>
                      )}
                      {a.attestationUid && <span className="tag">on-chain</span>}
                      {score !== null ? (
                        <div className="text-right">
                          <div className="text-2xl font-bold">{score}</div>
                          <div className="text-[10px] text-white/40 uppercase tracking-wider">/100</div>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40 italic">unevaluated</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function inputModeLabel(m: string) {
  return (
    {
      voice: "🎙 voice",
      text: "⌨ text",
      symbol: "🖼 symbol",
      gesture: "🤟 gesture",
      gaze: "👁 gaze",
    } as Record<string, string>
  )[m] ?? m;
}
