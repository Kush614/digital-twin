"use client";

import { useState } from "react";
import type { Application } from "@/lib/types";

type Props = { initial: Application };

export default function ApplicationView({ initial }: Props) {
  const [app, setApp] = useState<Application>(initial);
  const [evaluating, setEvaluating] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function evaluate() {
    setEvaluating(true);
    setErr(null);
    try {
      const r = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: app.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "evaluation failed");
      setApp(data.application);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setEvaluating(false);
    }
  }

  async function attest() {
    setAttesting(true);
    setErr(null);
    try {
      const r = await fetch("/api/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: app.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "attestation failed");
      setApp(data.application);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setAttesting(false);
    }
  }

  const evaluated = app.totalScore !== undefined;
  const attestation = app.attestationUid;

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="tag">{app.category}</span>
          <span className="tag">{inputModeLabel(app.inputMode)}</span>
          {app.faceDescriptor && (
            <span
              className="tag"
              style={{ background: "rgba(34,211,238,0.15)", color: "#67e8f9", borderColor: "rgba(34,211,238,0.35)" }}
              title="FaceLandmarker descriptor + liveness verified"
            >
              🔒 identity verified
            </span>
          )}
          {(app.fraudFlags?.length ?? 0) > 0 && (
            <span className="tag" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", borderColor: "rgba(245,158,11,0.35)" }}>
              ⚠ {app.fraudFlags!.length} flag{app.fraudFlags!.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold">{app.projectName}</h1>
        <a href={app.githubUrl} target="_blank" className="text-sm text-accent2 underline break-all">
          {app.githubUrl}
        </a>
      </header>

      {!evaluated && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-2">Run impact evaluation</h2>
          <p className="text-sm text-white/60 mb-4">
            Fetches the GitHub fingerprint (commits, contributors, issues, star timeline), runs the
            fraud heuristics, then asks the LLM to score across utility / innovation / technical /
            credibility — strictly bounded by the GitHub evidence.
          </p>
          <button className="btn" disabled={evaluating} onClick={evaluate}>
            {evaluating ? "Evaluating…" : "Run evaluation →"}
          </button>
        </div>
      )}

      {evaluated && (
        <>
          <ScoreCard total={app.totalScore!} sub={app.subScores!} rationale={app.rationale!} />
          {app.fingerprint && <FingerprintCard fp={app.fingerprint} />}
          {app.visionEvidence && <VisionCard evidence={app.visionEvidence} />}
          {app.fraudFlags && app.fraudFlags.length > 0 && <FraudCard flags={app.fraudFlags} />}
          <AttestCard
            app={app}
            attesting={attesting}
            onAttest={attest}
          />
          <button
            className="btn-ghost text-sm"
            onClick={evaluate}
            disabled={evaluating}
          >
            {evaluating ? "Re-evaluating…" : "↻ Re-evaluate"}
          </button>
        </>
      )}

      <details className="glass rounded-2xl p-5">
        <summary className="text-sm uppercase tracking-wider text-white/50 cursor-pointer">
          View pitch ({app.pitch.trim().split(/\s+/).length} words)
        </summary>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-white/80 font-sans">{app.pitch}</pre>
      </details>

      {err && <div className="text-warn text-sm">{err}</div>}
    </div>
  );
}

function inputModeLabel(m: string) {
  return (
    { voice: "🎙 Voice pitch", text: "⌨ Text pitch", symbol: "🖼 Symbol board", gesture: "🤟 Gesture", gaze: "👁 Eye gaze" } as Record<string, string>
  )[m] ?? m;
}

function ScoreCard({
  total,
  sub,
  rationale,
}: {
  total: number;
  sub: NonNullable<Application["subScores"]>;
  rationale: NonNullable<Application["rationale"]>;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold">Impact score</h2>
        <div className="text-5xl font-bold bg-gradient-to-br from-white to-accent2 bg-clip-text text-transparent">
          {total}
          <span className="text-2xl text-white/40">/100</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SubScore name="Utility" score={sub.utility} text={rationale.utility} />
        <SubScore name="Innovation" score={sub.innovation} text={rationale.innovation} />
        <SubScore name="Technical" score={sub.technical} text={rationale.technical} />
        <SubScore name="Credibility" score={sub.credibility} text={rationale.credibility} />
      </div>
    </div>
  );
}

function SubScore({ name, score, text }: { name: string; score: number; text: string }) {
  const pct = (score / 25) * 100;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs uppercase tracking-wider text-white/50">{name}</div>
        <div className="text-sm font-mono">
          {score}<span className="text-white/40">/25</span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-white/10 mb-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-white/60 leading-snug">{text}</div>
    </div>
  );
}

function FingerprintCard({ fp }: { fp: NonNullable<Application["fingerprint"]> }) {
  const cells: { k: string; v: string | number }[] = [
    { k: "Repo age",            v: `${fp.ageDays} d` },
    { k: "Stars",               v: fp.stars },
    { k: "Stars last 30d",      v: fp.starsLast30d },
    { k: "Contributors",        v: fp.contributors },
    { k: "Commits last 90d",    v: fp.commitsLast90d },
    { k: "Active days / 90",    v: fp.daysWithCommitsLast90d },
    { k: "PRs last 90d",        v: fp.pullRequestsLast90d },
    { k: "Closed issues",       v: fp.closedIssues },
    { k: "Forks",               v: fp.forks },
    { k: "Top languages",       v: fp.topLanguages.join(", ") || "—" },
  ];
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">GitHub fingerprint</h2>
        <a className="text-xs text-accent2 underline" href={fp.repoUrl} target="_blank">
          {fp.owner}/{fp.name}
        </a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
        {cells.map((c) => (
          <div key={c.k} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/40">{c.k}</div>
            <div className="font-mono mt-0.5">{c.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-white/40">
        Sub-scores: velocity {fp.velocityScore}/25 · contributors {fp.contributorScore}/25 ·
        engagement {fp.engagementScore}/25 · star-health {fp.starHealthScore}/25
      </div>
    </div>
  );
}

function VisionCard({ evidence }: { evidence: NonNullable<Application["visionEvidence"]> }) {
  const synth = Math.round(evidence.syntheticConfidence * 100);
  const isFlagged = evidence.syntheticConfidence >= 0.6;
  const isVideo = evidence.source === "video";
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">
          {isVideo ? "Video evidence" : "Vision evidence"}
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="tag">{sourceLabel(evidence.source)}</span>
          {evidence.frameCount !== undefined && (
            <span className="tag">{evidence.frameCount} keyframes</span>
          )}
          {evidence.transcript && <span className="tag">+ transcript</span>}
          <span className="tag">Z.AI · {evidence.rawModel ?? "vision"}</span>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-3">{evidence.description}</p>

      {evidence.transcript && (
        <div className="mb-3 rounded-lg border border-accent2/30 bg-accent2/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">
            Spoken transcript
          </div>
          <div className="text-sm text-white/85 italic leading-snug">
            “{evidence.transcript}”
          </div>
        </div>
      )}

      {isVideo && !evidence.transcript && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
          No spoken transcript captured — applicant may have been signing or recorded silently.
          The frame analysis still applies.
        </div>
      )}

      {evidence.frames && evidence.frames.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Sampled keyframes ({evidence.frames.length})
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {evidence.frames.map((f, i) => (
              <div key={i} className="relative">
                <img
                  src={f}
                  alt={`keyframe ${i + 1}`}
                  className="rounded border border-white/10 aspect-video object-cover w-full"
                />
                <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/70 text-white/80 px-1 rounded font-mono">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {evidence.claimsVisible.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Claims visible</div>
          <ul className="list-disc list-inside text-sm text-white/70 space-y-0.5">
            {evidence.claimsVisible.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {evidence.technicalSignals.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Technical signals</div>
          <div className="flex flex-wrap gap-1.5">
            {evidence.technicalSignals.map((s, i) => (
              <span key={i} className="tag">{s}</span>
            ))}
          </div>
        </div>
      )}
      <div className={"text-xs " + (isFlagged ? "text-warn" : "text-white/50")}>
        Synthetic confidence: {synth}%
        {isFlagged ? " — flagged in fraud signals" : " — within tolerance"}
      </div>
    </div>
  );
}

function sourceLabel(s: NonNullable<Application["visionEvidence"]>["source"]): string {
  return ({
    upload: "📁 upload",
    camera: "📷 live camera",
    screen: "🖥 screen",
    video: "🎬 video pitch",
  } as Record<string, string>)[s] ?? s;
}

function FraudCard({ flags }: { flags: NonNullable<Application["fraudFlags"]> }) {
  return (
    <div className="rounded-2xl p-6 border border-warn/40 bg-warn/5">
      <h2 className="text-lg font-semibold mb-2 text-warn">Fraud signals</h2>
      <ul className="space-y-2">
        {flags.map((f, i) => (
          <li key={i} className="text-sm">
            <div className="font-medium text-white/90">
              <span className="font-mono mr-2 text-warn">[{f.severity}]</span>
              {humanize(f.kind)}
            </div>
            <div className="text-white/60 ml-1">{f.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function humanize(k: string) {
  return k.replace(/-/g, " ");
}

function AttestCard({
  app,
  attesting,
  onAttest,
}: {
  app: Application;
  attesting: boolean;
  onAttest: () => void;
}) {
  const chain = process.env.NEXT_PUBLIC_EAS_CHAIN || "base-sepolia";
  const explorer =
    chain === "base-sepolia"
      ? "https://sepolia.basescan.org"
      : "https://sepolia.etherscan.io";

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">On-chain attestation</h2>
        <span className="tag">EAS · {chain}</span>
      </div>
      <p className="text-sm text-white/60 mb-3">
        Publish this score as an EAS attestation. The receipt is permanent, portable, and lets
        future grant rounds verify a builder's prior impact without re-evaluation.
      </p>
      {!app.attestationUid && (
        <button className="btn" disabled={attesting} onClick={onAttest}>
          {attesting ? "Attesting…" : "Publish attestation →"}
        </button>
      )}
      {app.attestationUid && (
        <div className="text-sm space-y-1 font-mono">
          <div className="text-white/70">UID:</div>
          <div className="text-accent2 break-all">{app.attestationUid}</div>
          {app.attestationTxHash && (
            <a
              href={`${explorer}/tx/${app.attestationTxHash}`}
              target="_blank"
              className="text-xs text-accent2 underline"
            >
              view tx ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
