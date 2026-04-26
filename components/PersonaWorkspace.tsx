"use client";

import { useEffect, useRef, useState } from "react";
import AvatarPlayer from "./AvatarPlayer";
import ChatPanel from "./ChatPanel";
import GovernancePanel from "./GovernancePanel";
import MintPanel from "./MintPanel";
import type { Constitution, Contributor } from "@/lib/types";

export type WorkspaceProps = {
  initial: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    constitution: Constitution;
    contributors: Contributor[];
    tokenId: number | null;
    txHash: string | null;
    voiceId: string | null;
    avatarId: string | null;
  };
};

export default function PersonaWorkspace({ initial }: WorkspaceProps) {
  const [speaking, setSpeaking] = useState(false);
  const [lastReply, setLastReply] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-7 glass rounded-2xl p-6 flex flex-col">
        <header className="mb-4">
          <h1 className="text-3xl font-bold">{initial.name}</h1>
          <p className="text-white/60">{initial.tagline}</p>
        </header>
        <div className="rounded-xl overflow-hidden border border-white/5 bg-black/30 mb-4">
          <AvatarPlayer
            name={initial.name}
            speaking={speaking}
            avatarId={initial.avatarId}
          />
        </div>
        <ChatPanel
          personaId={initial.id}
          personaName={initial.name}
          onSpeakingChange={setSpeaking}
          onReply={setLastReply}
        />
        <audio ref={audioRef} hidden />
      </section>

      <aside className="lg:col-span-5 space-y-6">
        <MintPanel personaId={initial.id} initialTokenId={initial.tokenId} initialTxHash={initial.txHash} />
        <GovernancePanel personaId={initial.id} initial={initial.constitution} />
      </aside>
    </div>
  );
}
