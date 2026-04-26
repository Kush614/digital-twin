"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InputMode } from "@/lib/types";

const MODES: { id: InputMode; label: string; icon: string; hint: string }[] = [
  { id: "voice",   label: "Voice",         icon: "🎙", hint: "Speak your pitch — browser speech recognition fills it in." },
  { id: "text",    label: "Text",          icon: "⌨",  hint: "Type or paste a written pitch." },
  { id: "symbol",  label: "Symbol board",  icon: "🖼",  hint: "Tap concept tiles to build a structured pitch (AAC-style)." },
  { id: "gesture", label: "Gesture",       icon: "🤟",  hint: "MediaPipe-driven hand-pose vocabulary (preview)." },
  { id: "gaze",    label: "Eye gaze",      icon: "👁",  hint: "Eye-tracking selection (preview)." },
];

const SYMBOLS: { label: string; phrase: string }[] = [
  { label: "Problem",    phrase: "The problem we solve is " },
  { label: "Who",        phrase: "Our users are " },
  { label: "How",        phrase: "We solve it by " },
  { label: "Built",      phrase: "We have already built " },
  { label: "Open source",phrase: "Our code is open-source at " },
  { label: "Impact",     phrase: "If funded, our next milestone is " },
  { label: "Disability", phrase: "This grant helps me overcome " },
  { label: "Team",       phrase: "Our team is " },
];

export default function ApplyForm() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("text");
  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState("Public goods");
  const [githubUrl, setGithubUrl] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => () => recRef.current?.stop?.(), []);

  function appendPitch(s: string) {
    setPitch((p) => (p ? `${p.replace(/\s+$/, "")} ${s}` : s));
  }

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop?.();
      setListening(false);
      return;
    }
    const SR =
      (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
      (typeof window !== "undefined" && (window as any).webkitSpeechRecognition);
    if (!SR) {
      alert("Browser speech recognition isn't available here. Try Chrome or Edge — or switch to Text / Symbol mode.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i]?.[0]?.transcript;
        if (t) appendPitch(t.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName,
          category,
          walletAddress: walletAddress || undefined,
          githubUrl,
          pitch,
          inputMode: mode,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(
          d?.error?.formErrors?.join(", ") ||
          d?.error?.fieldErrors?.[Object.keys(d?.error?.fieldErrors ?? {})[0] ?? ""]?.[0] ||
          "Submission failed"
        );
      }
      const { application } = await r.json();
      router.push(`/a/${application.slug}`);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Pitch input mode</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={
                "px-3 py-1.5 rounded-lg text-sm transition border " +
                (mode === m.id
                  ? "bg-accent/20 border-accent text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:border-white/30")
              }
            >
              <span className="mr-1">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/50 mb-4">
          {MODES.find((m) => m.id === mode)?.hint}
        </p>

        {mode === "voice" && (
          <div className="mb-3">
            <button
              type="button"
              className={listening ? "btn" : "btn-ghost"}
              onClick={toggleVoice}
            >
              {listening ? "● recording — click to stop" : "🎙 Start dictating"}
            </button>
          </div>
        )}

        {mode === "symbol" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {SYMBOLS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => appendPitch(s.phrase)}
                className="aspect-square rounded-xl border border-white/10 bg-white/5 hover:bg-accent/10 hover:border-accent/40 transition text-sm font-medium flex items-center justify-center text-center px-2"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {(mode === "gesture" || mode === "gaze") && (
          <div className="mb-3 rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-xs text-white/60">
            <div className="font-medium text-white/80 mb-1">
              {mode === "gesture" ? "Gesture preview" : "Eye-gaze preview"}
            </div>
            <div>
              The full {mode} pipeline runs on MediaPipe in the browser. For the hackathon demo,
              type into the field below to simulate the selected vocabulary — every other layer
              (scoring, fraud check, attestation) is identical regardless of how the pitch is
              entered.
            </div>
          </div>
        )}

        <textarea
          required
          className="input min-h-[160px] font-mono text-sm"
          placeholder="Your pitch will appear here. Mode-specific helpers above add to it."
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
        />
        <div className="text-[10px] text-white/40 mt-1">
          {pitch.trim().split(/\s+/).filter(Boolean).length} words
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="text-xs uppercase tracking-wider text-white/40">Project</div>
        <Field label="Project name">
          <input required className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. ImpactLens" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Category">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Public goods</option>
              <option>DAO governance</option>
              <option>Climate / DePIN</option>
              <option>Identity / privacy</option>
              <option>Education</option>
              <option>Health</option>
              <option>Open-source infra</option>
            </select>
          </Field>
          <Field label="Wallet (optional, for attestation)">
            <input className="input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x…" />
          </Field>
        </div>
        <Field label="GitHub repo URL">
          <input
            required
            type="url"
            className="input"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
          />
        </Field>
      </div>

      {err && <div className="text-warn text-sm">{err}</div>}

      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>
          {busy ? "Submitting…" : "Submit application →"}
        </button>
        <span className="text-xs text-white/40">
          Next step: GitHub fingerprint + AI scoring + fraud signals.
        </span>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-white/50 mb-1">{label}</div>
      {children}
    </label>
  );
}
