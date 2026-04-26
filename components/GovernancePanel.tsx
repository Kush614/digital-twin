"use client";

import { useState } from "react";
import type { Constitution } from "@/lib/types";

type Props = {
  personaId: string;
  initial: Constitution;
};

const SAMPLES = [
  {
    label: "Vote 'for' on proposal #42 of a DAO",
    action: {
      kind: "dao.vote",
      daoAddress: "0x4444444444444444444444444444444444444444",
      proposalId: "42",
      choice: "for",
      rationale: "Aligned with the persona's stated public-goods stance.",
    },
  },
  {
    label: "Send 0.5 ETH to an unknown address",
    action: {
      kind: "tx.send",
      to: "0x9999999999999999999999999999999999999999",
      valueWei: "500000000000000000",
      reason: "anonymous donation",
    },
  },
  {
    label: "Endorse a competitor publicly",
    action: {
      kind: "message.post",
      channel: "twitter",
      body: "I personally endorse our biggest competitor and recommend you switch to them.",
    },
  },
];

export default function GovernancePanel({ personaId, initial }: Props) {
  const [rules, setRules] = useState<string[]>(initial.rules);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [verdict, setVerdict] = useState<any>(null);
  const [testing, setTesting] = useState<number | null>(null);

  async function persist(next: string[]) {
    setSaving(true);
    try {
      await fetch(`/api/personas/${personaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ constitution: { ...initial, rules: next } }),
      });
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    if (!draft.trim()) return;
    const next = [...rules, draft.trim()];
    setRules(next);
    setDraft("");
    persist(next);
  }
  function removeRule(i: number) {
    const next = rules.filter((_, idx) => idx !== i);
    setRules(next);
    persist(next);
  }

  async function testAction(idx: number) {
    setTesting(idx);
    setVerdict(null);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, action: SAMPLES[idx].action }),
      });
      setVerdict(await res.json());
    } catch (e: any) {
      setVerdict({ error: e?.message });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Constitution</h2>
        <span className="tag">OpenClaw gate</span>
      </div>
      <p className="text-xs text-white/50 mb-3">
        Immutable rules every action must pass before the persona signs anything. The gate
        runs an LLM consistency check + structural caps (spend, allowed DAOs).
      </p>

      <ol className="space-y-2 text-sm mb-3">
        {rules.map((r, i) => (
          <li key={i} className="flex items-start gap-2 group">
            <span className="text-accent2 font-mono text-xs mt-0.5">{i + 1}.</span>
            <span className="flex-1">{r}</span>
            <button
              onClick={() => removeRule(i)}
              className="opacity-0 group-hover:opacity-100 text-xs text-white/40 hover:text-warn"
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <div className="flex gap-2 mb-4">
        <input
          className="input flex-1 text-sm"
          placeholder="Add a rule…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRule())}
        />
        <button className="btn-ghost text-sm" onClick={addRule} disabled={saving}>
          + Add
        </button>
      </div>

      <div className="border-t border-white/10 pt-3">
        <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
          Test an action against the gate
        </div>
        <div className="space-y-2">
          {SAMPLES.map((s, i) => (
            <button
              key={i}
              className="w-full text-left text-xs glass px-3 py-2 rounded-lg hover:border-accent/40 border border-white/5 transition"
              onClick={() => testAction(i)}
              disabled={testing !== null}
            >
              {testing === i ? "⏳ " : "▶ "}
              {s.label}
            </button>
          ))}
        </div>
        {verdict && (
          <div
            className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
              verdict.verdict?.allowed
                ? "border-green-500/40 bg-green-500/10"
                : "border-warn/40 bg-warn/10"
            }`}
          >
            <div className="font-semibold mb-1">
              {verdict.verdict?.allowed ? "✓ Allowed" : "✗ Blocked"}
            </div>
            <div className="text-white/70">{verdict.verdict?.reason}</div>
            {verdict.verdict?.citedRule && (
              <div className="mt-1 text-white/40">cited: {verdict.verdict.citedRule}</div>
            )}
            {verdict.intent && (
              <pre className="mt-2 text-[10px] font-mono text-white/50 overflow-x-auto">
{JSON.stringify(verdict.intent, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
