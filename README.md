# Kiln — A Multi-Agent Deal Desk Co-Pilot

> *"Where clay gets fired into final form."*

Kiln is a multi-agent deal desk co-pilot: an autonomous orchestrator coordinates five specialist sub-agents to review a non-standard SaaS deal end-to-end — pricing, ASC 606 revenue recognition, contract redlines, approval routing, and customer/internal communications — in roughly 60 seconds. It posts the resulting review to a real Slack workspace and emits a complete artifact bundle (DOCX, PDF, XLSX, EML).

It was built as a working artifact for an application to Clay's Deal Strategy & Ops team. The goal is to be a tool you can play with on a phone in five minutes, not a slide deck about one.

---

## What is Kiln?

Most "AI for deal desk" demos generate a paragraph of text and call it done. Kiln is structured: an **Orchestrator** dispatches five specialist sub-agents in parallel, each with a tightly scoped domain and a typed Zod-validated output schema.

- **Pricing Agent** — discount stacking, effective-rate analysis, ramp/credit modeling, alternative structures
- **ASC 606 Agent** — performance obligation identification, variable consideration, revenue recognition schedule
- **Redline Agent** — flags non-standard clauses (MFN, exclusivity, rollover credits, custom data residency) and drafts counter-positions
- **Approval Agent** — walks the configurable approval matrix and routes to the correct signers based on ACV, discount depth, and clause triggers
- **Comms Agent** — generates AE briefing email, customer-facing email, and approval one-pager copy

The agents run on top of the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) with four internal MCP servers (CRM, Vector, Exa, Slack). Every review produces a real Slack post in a demo workspace and a downloadable artifact bundle: redlined MSA (`.docx`), order form (`.pdf`), approval one-pager (`.pdf`), AE email (`.eml`), and a 10-tab financial workbook (`.xlsx`) with **live cross-tab formulas** — edit the discount cell and the rev rec schedule recalculates.

---

## Live demo

**Hosted URL**: _pending Phase 10 deploy — placeholder._

The five hero scenarios serve cached agent outputs for fast, deterministic playback. The "Submit your own deal" path triggers a **genuinely live** orchestrator run (no caching) — every visitor submission is a real LLM call against Anthropic's API. Approximate cost per submission: a few cents.

---

## How it works

For a full walkthrough — architecture diagrams, agent contracts, worked example timeline — see the in-app `/how-it-works` page (source: [`app/how-it-works/page.tsx`](app/how-it-works/page.tsx)).

The short version:

1. **Orchestrator** (`lib/agents/orchestrator.ts`) loads the deal from the SQLite CRM, gathers context from Exa + vector k-NN over the seeded deal corpus, then dispatches the five sub-agents via `Promise.all`.
2. Each sub-agent runs in its own `query()` session against the Agent SDK with bounded reasoning (`effort: low`, `maxTurns: 2`) and a typed output schema. Models are mixed: **Opus 4.7** for the orchestrator and ASC 606 (highest-stakes reasoning), **Sonnet 4.6** for Pricing / Redline / Comms, **Haiku 4.5** for Approval routing (deterministic table lookup).
3. **Customer signals** come from Exa for real companies (Anthropic, Notion). For fictional companies (Tessera, Northbeam, Reverberate) the signals are simulated and badged in the UI.
4. **Similar past deals** come from k-NN over a sqlite-vec virtual table populated with embeddings of all 40 seeded deals (`text-embedding-3-small`).
5. **Slack posts** fire on every review — Block Kit messages to a real `#deal-desk` channel in the `kiln-demo` workspace.
6. Hero scenario outputs are cached at `db/seed/cached_outputs/` for demo determinism. Visitor submissions live only in memory, scoped to a signed session cookie.

---

## What's real, what's demo data

Honesty matters more than overclaiming. Here is exactly what is real and what is demo data:

| Component | Real | Demo / fictional |
|---|---|---|
| The 40 seeded deals | — | Entirely fictional; written to feel like a real Clay-shaped pipeline |
| Hero scenario customer names | Anthropic, Notion (public companies, plausible deal shapes invented) | Tessera Health, Northbeam Mortgage, Reverberate Growth |
| Exa customer signals | Real funding / headcount / leadership signals for real companies | Simulated and badged for fictional companies |
| Slack posts | Real posts to a real `kiln-demo` workspace (invite link in app) | — |
| Generated artifacts (`.docx`, `.pdf`, `.xlsx`, `.eml`) | Real files; the `.xlsx` has live cross-tab formulas that recalc in Excel/Numbers/Sheets | Content is per-deal, agent-generated |
| LLM calls | Real Anthropic API calls on visitor submissions | Cached output replay on hero scenarios |
| ASC 606 reasoning | Real schedule arithmetic in the workbook | Not auditor-reviewed; a working model, not financial advice |

The in-app banners match this disclosure exactly.

---

## Repo structure

```
app/                    Next.js 15 App Router routes + API endpoints
components/             UI components (server-first, "use client" where needed)
lib/
  agents/               Orchestrator + 5 sub-agents (one file each)
  prompts/              Markdown system prompts (grep-able, forkable)
  mcp-servers/          4 internal MCP servers (CRM, Vector, Exa, Slack)
  tools/                MCP tool clients used by the orchestrator
  document-templates/   DOCX, PDF, XLSX, EML generators
  visitor-submit/       Submit-your-own-deal pipeline (in-memory, session-scoped)
db/
  migrations/           Numbered SQL migrations
  seed/                 Customers, deals, guardrails, approval matrix, cached outputs
  kiln.db               Committed SQLite file (deterministic for demos)
docs/                   Design docs — read these for design rationale
```

---

## Running locally

Requirements: Node 18+, npm, an Anthropic API key.

```bash
git clone https://github.com/fbalenko/kiln.git
cd kiln
npm install
cp .env.example .env.local
# fill in .env.local — see env vars below
npm run seed     # populates SQLite + generates embeddings (one-time)
npm run dev
```

Visit `http://localhost:3000`.

### Required environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | All agent inference (Orchestrator + 5 sub-agents) |
| `OPENAI_API_KEY` | Embeddings only (`text-embedding-3-small`) for vector search seed |
| `EXA_API_KEY` | Public customer signals for real companies |
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-…`) for posting to the demo workspace |
| `SLACK_DEAL_DESK_CHANNEL_ID` | Target channel ID in `kiln-demo` |

`.env.example` is committed at the repo root with descriptions and links for each key.

---

## Future work — Clay integration

Kiln was designed with Clay integration as the natural next step. The orchestrator's "gather context" phase already runs Exa public signals and vector k-NN in parallel; a Clay arm would slot in alongside them, surfacing live firmographic, intent, and contact data on the customer being reviewed and feeding it directly into the Pricing and Comms agent prompts.

The integration was **scoped but not shipped** in this build. Clay's MCP server is presently consumable by Claude Desktop and ChatGPT clients but not by arbitrary Node MCP clients due to constraints in the OAuth handshake. The dashboard already reserves a locked Clay KPI tile for when the integration is live.

The full architecture, three fallback paths (waiting on MCP Authorization OAuth 2.1, fixture-based snapshots via Claude Desktop, or direct HTTP API), and the JD-aligned features the integration unlocks — account-aware pricing, buyer-committee mapping, intent-triggered approval fast-tracking, and live dashboard signals — are documented in [docs/13-clay-integration-plan.md](docs/13-clay-integration-plan.md).

---

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript strict**
- **Tailwind** + **shadcn/ui**, **framer-motion** for transitions
- **`@anthropic-ai/claude-agent-sdk`** + **Model Context Protocol** (4 internal MCP servers)
- **better-sqlite3** with **sqlite-vec** for vector k-NN
- **exceljs** for the live-formula financial workbook
- **docx** + **pdfkit** for redlined contract and one-pager generation

No Postgres, no Redis, no Docker, no auth. One Next.js app, one SQLite file.

---

## License

MIT. Fork it, take it, ship it.

---

## Acknowledgments

Built by **Filip Balenko** — [LinkedIn](https://www.linkedin.com/in/filipbalenko/) · filippbalenko@gmail.com

Built as a working artifact for a job application to Clay's Deal Strategy & Ops team.
