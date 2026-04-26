"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [corpus, setCorpus] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    const text = await file.text();
    setCorpus((c) => (c ? `${c}\n\n${text}` : text));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, tagline, corpus, styleNotes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.formErrors?.join(", ") ?? "Failed to create persona");
      }
      const { persona } = await res.json();
      router.push(`/persona/${persona.slug}`);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50 mb-1">
          Persona name
        </label>
        <input
          required
          className="input"
          placeholder="e.g. Ayush v1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50 mb-1">
          Tagline
        </label>
        <input
          className="input"
          placeholder="A one-liner the world sees"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50 mb-1">
          Corpus (paste writing, transcripts, bio — or drop a .txt / .md file)
        </label>
        <textarea
          required
          className="input min-h-[180px] font-mono text-sm"
          placeholder="The more authentic-voice text you give it, the better the clone."
          value={corpus}
          onChange={(e) => setCorpus(e.target.value)}
        />
        <input
          type="file"
          accept=".txt,.md,.markdown"
          className="mt-2 text-xs text-white/50"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50 mb-1">
          Style notes (optional)
        </label>
        <textarea
          className="input min-h-[80px] text-sm"
          placeholder="e.g. Direct, dry humor, never uses emojis. Engineering-flavored metaphors."
          value={styleNotes}
          onChange={(e) => setStyleNotes(e.target.value)}
        />
      </div>

      {error && <div className="text-sm text-warn">{error}</div>}

      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>
          {busy ? "Forging…" : "Forge persona →"}
        </button>
        <span className="text-xs text-white/40">
          Voice cloning, avatar, and on-chain mint happen on the persona page.
        </span>
      </div>
    </form>
  );
}
