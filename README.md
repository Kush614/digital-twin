# PersonaForge

> Clone yourself. Deploy a face-and-voice clone that takes meetings while you sleep and votes in your DAOs within rules you signed. Owned as an NFT, governed by a constitution your contributors helped write.

Built in one day at the **2026 BETA Hackathon** (Frontier Tower, San Francisco). PersonaForge is a single product spanning three tracks:

| Track | Surface | Sponsor signal |
|---|---|---|
| **AI Native & New Species** | Deployable persona at a public URL — a new identity primitive that is content + agent + economic actor in one | Z.AI / Zhipu Ecosystem Fund |
| **Voice & Vision** | Cloned voice + animated avatar + full-duplex mic loop, wired for SpatialReal embed | SpatialReal · BodhiAgent |
| **Crypto & Agents** | ERC-721 ownership with on-chain royalty splits, OpenClaw-style action layer with pre-execution constitutional gate | GCC Foundation · OpenClaw |

---

## Quickstart

```bash
npm install
cp .env.example .env.local
# fill in at minimum ZAI_API_KEY (or ANTHROPIC_API_KEY as fallback)
npm run dev
# open http://localhost:3000
```

### Optional: deploy the NFT contract

```bash
# in .env.local set:
#   SEPOLIA_RPC_URL=https://...
#   DEPLOYER_PRIVATE_KEY=0x...

npm run deploy:contract
# script prints the deployed address — paste into:
#   PERSONA_NFT_ADDRESS=...
#   NEXT_PUBLIC_PERSONA_NFT_ADDRESS=...
```

### Optional: voice cloning

Set `ELEVENLABS_API_KEY` and a `voiceId`. Without it the chat uses browser TTS (works fine for demo).

### Optional: SpatialReal avatar

Set `SPATIALREAL_API_KEY` + `SPATIALREAL_AVATAR_ID` and `NEXT_PUBLIC_SPATIALREAL_EMBED_URL`. Without it the page renders a procedural canvas avatar that pulses while the persona speaks.

---

## Demo flow (90-second judge pitch)

1. **Forge** — paste a corpus on `/`, click *Forge persona*. Get a public URL.
2. **Talk** — chat in text or hold the mic button. Persona replies in its own voice; avatar pulses while speaking.
3. **Mint** — click *Mint persona* (right column). Wallet pops up, tx lands on Sepolia. Token has the persona's URI + constitution hash.
4. **Govern** — add a rule like *"Never vote for proposals from address 0x99…"*.
5. **Test the gate** — click *Send 0.5 ETH to an unknown address*. Watch the constitutional gate **block** with the cited rule. Click *Vote 'for' on proposal #42* — gate **allows**, returns a signed intent payload.

That's the whole pitch: one identity, three tracks, built end to end.

---

## Architecture

```
Next.js 15 (App Router) + TypeScript + Tailwind
├── app/
│   ├── page.tsx              landing + upload + persona list
│   ├── persona/[id]/page.tsx workspace (avatar / chat / mint / governance)
│   └── api/
│       ├── personas[/[id]]   CRUD on persona JSON files
│       ├── chat              streaming LLM (Z.AI primary, Anthropic fallback)
│       ├── tts               ElevenLabs streaming → audio/mpeg
│       └── actions           OpenClaw-style gated action endpoint
├── components/
│   ├── UploadForm            corpus → persona
│   ├── ChatPanel             text + voice (Web Speech) duplex
│   ├── AvatarPlayer          SpatialReal iframe OR procedural canvas
│   ├── MintPanel             viem + browser wallet → Sepolia mint
│   └── GovernancePanel       constitution editor + live gate tester
├── lib/
│   ├── persona.ts            filesystem persistence
│   ├── llm.ts                provider router (Z.AI / Anthropic / mock)
│   ├── openclaw.ts           constitutional gate + structural caps
│   └── contractAbi.ts        on-chain interface
├── contracts/PersonaNFT.sol  self-contained ERC-721 + royalty split
└── scripts/deploy-contract.mjs   solc + viem one-shot deploy
```

### Constitutional gate

`/api/actions` accepts a typed `AgentAction` (DAO vote / tx send / message post). Before returning an executable intent it runs:

1. **Structural checks** — `spendCapWei`, `allowedDaos`, etc. (cheap, deterministic)
2. **LLM gate** — feeds the constitution + proposed action to the model with a strict JSON-only verdict instruction. Defaults to *deny* on parse failure or missing key.

This is the AI-safety hook we want GCC to grade.

### On-chain royalty splits

`PersonaNFT.sol` stores a `Contributor[]` per token (wallet + basis-point share, must sum to 10000). `tip(tokenId)` is `payable` and pays out each contributor in a single tx. Every payment fires a `RoyaltyPaid` event for off-chain accounting.

---

## Open-source notice

This repository is open-source under MIT to qualify for the GCC OpenClaw grant track. The constitutional-gate pattern in `lib/openclaw.ts` is the part we'd most like reused — it's a small surface that meaningfully changes the safety profile of an action-taking agent.

---

## Built by

Team at the 2026 BETA Hackathon · 2026-04-26 · Frontier Tower 2F, 995 Market St, SF
