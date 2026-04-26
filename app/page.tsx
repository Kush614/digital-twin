import Link from "next/link";
import { listPersonas } from "@/lib/persona";
import UploadForm from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const personas = await listPersonas();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <span className="tag">2026 BETA Hackathon</span>
          <span className="tag">AI Native</span>
          <span className="tag">Voice & Vision</span>
          <span className="tag">Crypto & Agents</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight bg-gradient-to-br from-white via-accent2 to-accent bg-clip-text text-transparent">
          PersonaForge
        </h1>
        <p className="mt-4 text-lg md:text-xl text-white/70 max-w-3xl">
          Upload yourself. Deploy a face-and-voice clone that takes meetings while you sleep
          and votes in your DAOs within rules you signed. Owned as an NFT, governed by a
          constitution your contributors helped write.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-white/60">
          <div className="glass rounded-xl p-4">
            <div className="text-accent2 font-semibold mb-1">AI Native</div>
            A new kind of deployable identity — content, agent, and economic actor in one.
          </div>
          <div className="glass rounded-xl p-4">
            <div className="text-accent2 font-semibold mb-1">Voice & Vision</div>
            Real-time avatar with cloned voice over a full-duplex loop.
          </div>
          <div className="glass rounded-xl p-4">
            <div className="text-accent2 font-semibold mb-1">Crypto & Agents</div>
            On-chain ownership, royalty splits, OpenClaw action layer with pre-execution
            constitutional checks.
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 glass rounded-2xl p-6">
          <h2 className="text-2xl font-semibold mb-4">Forge a persona</h2>
          <UploadForm />
        </div>

        <aside className="lg:col-span-2 glass rounded-2xl p-6">
          <h2 className="text-2xl font-semibold mb-4">Live personas</h2>
          {personas.length === 0 ? (
            <p className="text-white/50 text-sm">
              None yet. Be the first — anything you upload is deployable on a public URL.
            </p>
          ) : (
            <ul className="space-y-3">
              {personas.slice(0, 12).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/persona/${p.slug}`}
                    className="block rounded-lg border border-white/5 hover:border-accent/60 p-3 transition"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-white/50 truncate">{p.tagline}</div>
                    {p.tokenId !== undefined && (
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-accent2">
                        Minted #{p.tokenId}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      <footer className="mt-16 text-xs text-white/40 flex flex-wrap items-center justify-between gap-2">
        <span>Built in one day at Frontier Tower, San Francisco.</span>
        <span>
          Sponsors: Z.AI · SpatialReal · BodhiAgent · GCC Foundation (OpenClaw)
        </span>
      </footer>
    </main>
  );
}
