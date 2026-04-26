import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersona } from "@/lib/persona";
import PersonaWorkspace from "@/components/PersonaWorkspace";

export const dynamic = "force-dynamic";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const persona = await getPersona(id);
  if (!persona) notFound();

  const initial = {
    id: persona.id,
    slug: persona.slug,
    name: persona.name,
    tagline: persona.tagline,
    constitution: persona.constitution,
    contributors: persona.contributors,
    tokenId: persona.tokenId ?? null,
    txHash: persona.txHash ?? null,
    voiceId: persona.voiceId ?? null,
    avatarId: persona.avatarId ?? null,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← PersonaForge
        </Link>
        <div className="text-xs text-white/40 font-mono">/{persona.slug}</div>
      </nav>
      <PersonaWorkspace initial={initial} />
    </main>
  );
}
