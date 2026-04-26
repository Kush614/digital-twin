# ImpactLens

> Every builder deserves a fair shot. **No voice required. No fakers rewarded.**

The grant system is broken in two directions at once — it excludes people who can't speak well, and it rewards people who fake impact. ImpactLens fixes both: multimodal pitches, GitHub-grounded scoring, on-chain attestation. Built in one day at the **2026 BETA Hackathon** (Frontier Tower, San Francisco).

| Track | How ImpactLens hits it |
|---|---|
| **Crypto & Agents (GCC)** — primary | DAO-grants evaluator agent · fund-allocation tooling · impact evaluation · AI-safety credibility check · on-chain EAS attestations |
| **Voice & Vision** | Multimodal pitch input: voice (Web Speech), symbol-board AAC, gesture and eye-gaze placeholders for MediaPipe |
| **AI Native** | The artifact is the **on-chain attestation**, not the chat. New format: portable, verifiable, fraud-resistant impact receipts |

The reviewer's brief said it best: **"your impact is in your code, not your charisma."**

---

## Why this is the strongest pitch in the room

- **1B+** people globally have communication / speech disabilities. None of them are first-class citizens of the grant world today.
- **$140M+** distributed by Gitcoin / Optimism RetroPGF — with documented sybil and inflation problems.
- **~30%** of applications in major rounds are estimated fraudulent or inflated.
- **0** open-source tools address both barriers at once. ImpactLens is the first.

---

## Quickstart

```bash
npm install
cp .env.example .env.local           # fill ZAI_API_KEY (or ANTHROPIC_API_KEY)
npm run dev                            # http://localhost:3000
```

That alone gives you the full demo loop: multimodal apply → GitHub fingerprint → AI scoring → reviewer panel → mock on-chain attestation.

### Optional escalations

| Goal | Add to `.env.local` | Then |
|---|---|---|
| Higher GitHub rate limit (5k/h) | `GITHUB_TOKEN` | dev server picks it up |
| Real on-chain attestation on Base Sepolia | `EAS_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL` | `npm run register:schema` → paste UID into `EAS_SCHEMA_UID` |

Funded a brand-new wallet from a faucet ([Alchemy Base Sepolia](https://www.alchemy.com/faucets/base-sepolia)) — 0.01 ETH covers the schema register + dozens of attestations.

---

## Demo flow (90 seconds, on stage)

1. **Open `/`** — read the manifesto + the four counters (1B / $140M / 30% / 0).
2. **Click "Apply for a grant" → choose "Symbol board"**. Tap *Problem*, *Who*, *How*, *Built* tiles to assemble a pitch without typing a word. Submit.
3. **Watch the per-application page** — click *Run evaluation*. The page fetches the GitHub fingerprint (commits, contributors, issues, star timeline), computes 4 sub-scores, runs fraud heuristics, then asks Z.AI to score utility / innovation / technical / credibility against the GitHub evidence.
4. **Submit a fake-looking project** for contrast — paste a brand-new repo with bought-stars pattern. Watch the *Star spike* and *Ghost repo* fraud flags surface, dragging credibility to ~5/25.
5. **Click "Publish attestation"** — the mock UID prints (or real Base Sepolia tx if keys are set). The receipt is permanent: a builder in 2030 can prove they scored 87/100 in 2026.
6. **Click "Reviewer panel"** — applications sorted by score, fraud-flagged ones surfaced.

---

## Architecture

```
Next.js 15 (App Router) + TypeScript + Tailwind
├── app/
│   ├── page.tsx                 manifesto + dual entry (apply / review)
│   ├── apply/page.tsx           multimodal pitch form
│   ├── a/[id]/page.tsx          per-application: scores, fingerprint, fraud flags, attest
│   ├── review/page.tsx          reviewer panel sorted by total score
│   └── api/
│       ├── applications[/[id]]  CRUD on application JSON files
│       ├── github/analyze       fetch + score GitHub fingerprint
│       ├── evaluate             github + fraud + LLM → structured impact score
│       └── attest               EAS attestation (Base Sepolia) or deterministic mock
├── components/
│   ├── ApplyForm.tsx            voice / text / symbol / gesture / gaze switcher
│   └── ApplicationView.tsx      score card + fingerprint + fraud + attest UI
├── lib/
│   ├── github.ts                GitHub REST + sub-score derivation (velocity, contributors,
│   │                            engagement, star-health) — each 0–25
│   ├── fraud.ts                 5 explainable heuristics: ghost repo, star spike, thin
│   │                            contributor graph, AI-pitch tells, brand-new + viral
│   ├── evaluator.ts             Z.AI primary (sponsor), Anthropic fallback, mock that
│   │                            still uses real GitHub signals → never fails the demo
│   ├── eas.ts                   Ethereum Attestation Service publish on Base Sepolia
│   ├── store.ts                 filesystem-backed application store
│   └── types.ts                 shared types
└── scripts/register-schema.mjs  one-shot EAS schema register
```

### The scoring model (fully transparent)

Total = utility + innovation + technical + credibility, each **0–25**, total 0–100.

- **Utility & Innovation** — LLM judgment, instructed to be skeptical and reward shipped code over promises.
- **Technical** — derived from four GitHub signals, each 0–25 then averaged:
  - **Velocity** — days with at least one commit in last 90 / 30 (clamped to 1.0)
  - **Contributor diversity** — distinct contributors / 5 (clamped)
  - **Engagement** — closed issues + recent PRs / 30 (clamped)
  - **Star health** — penalised if stars without commits, stars on a 14-day-old repo, or stars spiked in last 30d
- **Credibility** — LLM cross-references pitch claims against the GitHub fingerprint. Heavily penalised if a 1-contributor repo claims a "team" or 10k users.

### Fraud signals (from `lib/fraud.ts`)

| Flag | Severity | Trigger |
|---|---|---|
| `ghost-repo` | high | ≥50 stars but <3 commits in 90d and <3 contributors |
| `star-spike` | medium | >60% of total stars accumulated in last 30 days |
| `thin-contributor-graph` | low | Pitch references "team"/"we" but repo has 1 contributor |
| `ai-generated-pitch` | medium | 3+ LLM-typical phrases ("leverage", "cutting-edge", "unlock potential", …) |
| `ghost-repo` (variant) | high | Repo created <14 days ago but already has 100+ stars |

Every flag carries a concrete, human-verifiable detail string.

---

## What's bonus / what's locked in

**Locked in (works today, no keys needed):**
- All 5 input modes (gesture/gaze are explicit previews — same downstream pipeline)
- GitHub fingerprint (60 req/h without token, 5k/h with `GITHUB_TOKEN`)
- 5 fraud heuristics, fully deterministic
- Mock attestation UID (keccak of stable inputs) so the on-chain UX still demos

**Unlocked by env vars:**
- Real LLM scoring (`ZAI_API_KEY` or `ANTHROPIC_API_KEY`)
- Real on-chain attestation (`EAS_PRIVATE_KEY` + `EAS_SCHEMA_UID`)

**Out of scope for the 12-hour build (acknowledged):**
- Wallet-graph sybil detection (Etherscan side trip)
- Deepfake detection on video pitches (would plug in DeepfakeBench)
- Full MediaPipe gesture/eye-gaze runtime

---

## Why this wins the GCC track specifically

GCC's published criteria call for projects that **"meaningfully serve decentralized organizations and the public goods ecosystem"** with focus on **DAO governance, fund allocation, impact evaluation, AI safety and trust, organizational workflow optimization** — and require **open-source submissions**. ImpactLens hits **all five** in a single product:

- **DAO governance**: reviewer panel is the governance UI
- **Fund allocation**: composite score is the allocation signal
- **Impact evaluation**: the entire product
- **AI safety & trust**: fraud heuristics + credibility cross-check + mock-by-default attestation
- **Workflow optimisation**: replaces hours of human review per application

Open-source MIT, ready to drop into `gcc-foundation/gcc-openclaw-grants` issue tracker.

---

## License

MIT.
