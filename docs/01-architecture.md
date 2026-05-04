# 01 — Architecture

## High-level architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         BROWSER (mobile-first)                     │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│   │  Pipeline  │  │   Deal     │  │  Submit    │  │ Analytics  │   │
│   │   View     │  │   Detail   │  │  Own Deal  │  │   View     │   │
│   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘   │
└─────────┼───────────────┼───────────────┼───────────────┼──────────┘
          │               │               │               │
          │     SSE (streaming agent reasoning)           │
          │               │               │               │
┌─────────▼───────────────▼───────────────▼───────────────▼──────────┐
│                    NEXT.JS APP (Vercel)                            │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │              API ROUTES (app/api/*)                      │     │
│   │  /api/deals     /api/run-review     /api/submit-deal     │     │
│   │  /api/artifacts /api/eval           /api/audit-log       │     │
│   └────────────────────────┬─────────────────────────────────┘     │
│                            │                                       │
│   ┌────────────────────────▼─────────────────────────────────┐     │
│   │              ORCHESTRATOR (Claude Agent SDK)             │     │
│   │   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐       │     │
│   │   │Price │  │ASC606│  │Redln │  │Aprov │  │Comms │       │     │
│   │   │  Ag  │  │  Ag  │  │  Ag  │  │  Ag  │  │  Ag  │       │     │
│   │   └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘       │     │
│   └──────┼─────────┼─────────┼─────────┼─────────┼───────────┘     │
│          │         │         │         │         │                 │
│   ┌──────▼─────────▼─────────▼─────────▼─────────▼───────────┐     │
│   │                    TOOL LAYER (MCP)                      │     │
│   │  CRM    Vector    Exa     Slack    PDF/DOCX    Email     │     │
│   │  Tool   Search    Tool    Tool     Generator   Drafter   │     │
│   └────┬───────┬───────┬───────┬─────────┬──────────┬────────┘     │
└────────┼───────┼───────┼───────┼─────────┼──────────┼──────────────┘
         │       │       │       │         │          │
    ┌────▼────┐  │  ┌────▼───┐ ┌─▼──────┐  │     ┌────▼─────┐
    │ SQLite  │  │  │  Exa   │ │ Slack  │  │     │  Email   │
    │ (deals, │  │  │  API   │ │ Web    │  │     │ (mailto: │
    │  audit) │  │  └────────┘ │ API    │  │     │ in demo) │
    └─────────┘  │             └────────┘  │     └──────────┘
                 │                         │
            ┌────▼────────┐         ┌──────▼────────┐
            │ sqlite-vec  │         │   pdfkit /    │
            │ (embeddings)│         │   docx pkg    │
            └─────────────┘         └───────────────┘
```

## Why this stack

### Single Next.js app
- The HM doesn't care about microservices. They care about clicking a link and seeing it work. One Next.js app on Vercel ships in minutes and never breaks.
- API routes co-located with the frontend means no CORS, no API gateway, no separate deployment pipeline.

### SQLite, committed to the repo
- The mock CRM is **deterministic seed data** — every visitor sees the same 30–40 deals. SQLite gives us a single file we commit to git and the demo never has a "first-time setup" moment.
- `sqlite-vec` lets us do vector similarity search in the same DB. No Pinecone, no Weaviate, no separate vector store to spin up.
- Migrations are plain SQL files numbered `001_*.sql`, run on app boot.

### Claude Agent SDK
- Filip already used this for sfv-ic.com. Reusing the stack means faster build velocity.
- Native MCP support means our tool layer is just MCP servers — clean separation, easy to test individually.
- Streaming output works out of the box, which is critical for the "watch reasoning unfold" UX.

### shadcn/ui + Tailwind
- Aesthetic target: Linear / Stripe / Mercury. shadcn/ui ships there by default.
- Components are copied into the repo (not a dependency), so they're forkable and modifiable.
- No design-system project to maintain.

## Repo layout

```
kiln/
├── app/
│   ├── (marketing)/
│   │   └── page.tsx               # landing → redirects to /pipeline
│   ├── pipeline/
│   │   └── page.tsx               # Tier 1: pipeline view
│   ├── deals/
│   │   └── [id]/
│   │       └── page.tsx           # Tier 2: deal detail view
│   ├── submit/
│   │   └── page.tsx               # Tier 3: submit your own deal
│   ├── analytics/
│   │   └── page.tsx               # Pipeline analytics view
│   ├── how-it-works/
│   │   └── page.tsx               # full system showcase page — see docs/11-how-it-works-page.md
│   ├── if-clay-built-this/
│   │   └── page.tsx               # the "if we built this in Clay" appendix
│   ├── api/
│   │   ├── deals/
│   │   │   ├── route.ts           # list deals
│   │   │   └── [id]/route.ts      # get single deal
│   │   ├── run-review/
│   │   │   └── route.ts           # SSE: run agent pipeline on a deal
│   │   ├── submit-deal/
│   │   │   └── route.ts           # POST: visitor submits a deal
│   │   ├── artifacts/
│   │   │   └── [id]/[type]/route.ts # download generated PDF/DOCX
│   │   ├── audit-log/
│   │   │   └── [id]/route.ts      # fetch decision trace for a deal
│   │   ├── eval/
│   │   │   └── route.ts           # run eval harness on a scenario
│   │   └── slack-events/
│   │       └── route.ts           # optional: incoming Slack webhooks
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                        # shadcn components
│   ├── deal-card.tsx
│   ├── reasoning-stream.tsx       # the live agent reasoning visualization
│   ├── pricing-modeler.tsx        # interactive sliders
│   ├── approval-matrix-editor.tsx
│   ├── cpq-comparison-panel.tsx
│   ├── audit-log-view.tsx
│   ├── customer-signal-panel.tsx
│   ├── similar-deals-panel.tsx
│   └── ...
├── lib/
│   ├── agents/
│   │   ├── orchestrator.ts
│   │   ├── pricing-agent.ts
│   │   ├── asc606-agent.ts
│   │   ├── redline-agent.ts
│   │   ├── approval-agent.ts
│   │   └── comms-agent.ts
│   ├── prompts/
│   │   ├── orchestrator.md
│   │   ├── pricing-agent.md
│   │   ├── asc606-agent.md
│   │   ├── redline-agent.md
│   │   ├── approval-agent.md
│   │   └── comms-agent.md
│   ├── tools/
│   │   ├── crm.ts
│   │   ├── vector-search.ts
│   │   ├── exa-search.ts
│   │   ├── slack.ts
│   │   ├── pdf-generator.ts
│   │   └── docx-generator.ts
│   ├── db/
│   │   ├── client.ts              # better-sqlite3 singleton
│   │   ├── queries.ts
│   │   └── embeddings.ts
│   ├── eval/
│   │   ├── harness.ts
│   │   └── scenarios.ts
│   └── types.ts
├── db/
│   ├── kiln.db                    # committed SQLite file
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_audit_log.sql
│   │   └── 003_add_vector_indexes.sql
│   └── seed/
│       ├── customers.ts
│       ├── deals.ts
│       ├── scenarios/
│       │   ├── 01-anthropic-expansion.ts
│       │   ├── 02-notion-conversion.ts
│       │   ├── 03-competitive-displacement.ts
│       │   ├── 04-renewal-at-risk.ts
│       │   └── 05-agency-partnership.ts
│       └── run-seed.ts
├── public/
│   ├── og-image.png
│   └── kiln-logo.svg
├── .claude/
│   └── settings.json
├── .env.example
├── .env.local                     # gitignored
├── .gitignore
├── CLAUDE.md
├── README.md                      # public-facing repo README (different from spec README)
├── docs/                          # the spec docs (also published in repo for forking)
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

## Data flow: a single deal review

1. Visitor clicks a scenario card on `/pipeline`.
2. Browser opens `/deals/[id]` and immediately hits `/api/run-review` as an SSE stream.
3. The **Orchestrator** receives the deal payload from the CRM tool.
4. Orchestrator emits an event: `{ step: "fetching_customer_signals", agent: null }`.
5. Orchestrator calls `exa-search` MCP tool. Stream emits each result as it arrives.
6. Orchestrator dispatches to `Pricing Agent`. Stream emits `{ step: "pricing_analysis", agent: "pricing" }` and the pricing agent's reasoning streams as it computes.
7. Same for ASC 606 → Redline → Approval → Comms agents (parallelized where possible).
8. As each agent finishes, its structured output is emitted as a final event for that step.
9. Orchestrator emits `{ step: "synthesis", final_output: <complete review object> }`.
10. The complete review object is persisted to the audit log table for later inspection.
11. Slack post is fired (non-blocking). Generated artifacts are computed lazily on artifact-download requests.

The **stream is the UX**. The visitor watches each step happen. Total time: 45–75 seconds depending on Exa latency.

## Deployment

**Local development is the default for this build.** Phases 0–9 run entirely on `http://localhost:3000`. Deployment to a public URL happens only at Phase 10. Until then, the spec assumes `npm run dev` is the running surface.

When deployment time comes:

- **Hosting**: Vercel (Hobby tier is enough for the demo). Deploy from `main` branch on every push.
- **Domain**: the auto-generated Vercel URL is fine for v1 (`kiln-<hash>-fbalenko.vercel.app`). Custom domain optional.
- **Env vars**: set in Vercel dashboard. `.env.example` documents them.
- **SQLite on Vercel**: Vercel serverless functions are read-only on the file system. Use `/tmp` for runtime mutations (audit log) or — better — keep the audit log in-memory per session with a server-sent broadcast pattern. The committed `db/kiln.db` is read-only at runtime; copy to `/tmp/kiln.db` on cold start if writes are needed.
- **Edge vs Node runtime**: Use Node runtime for all API routes (better-sqlite3 doesn't work on Edge).

## Future migration paths

These are documented for future reference, not part of v1.

**Supabase migration** (if SQLite + Vercel limitations bite):
- Swap better-sqlite3 → `@supabase/supabase-js` in `lib/db/client.ts`
- Migrate the schema with the same migration files (PostgreSQL syntax mostly compatible)
- Swap sqlite-vec → pgvector for the embeddings table
- Run the seed script against Supabase to populate
- Net effort: ~1 day. The query layer at `lib/db/queries.ts` is the only place with non-trivial changes; everything else is configuration.

When this becomes worth doing: when the audit log resetting on cold starts becomes a noticeable demo problem, or when you want a UI for inspecting data (Supabase's table editor is genuinely useful). Until then, SQLite + `/tmp` is the simpler path.

**Alternative hosts** that support persistent SQLite without migration: Fly.io with a persistent volume, Railway with a volume mount. Both work but require more ops surface than Vercel.

## Performance targets

| Operation | Target |
|---|---|
| Cold-start API response | < 1.5s |
| First byte on `/pipeline` | < 800ms |
| Agent pipeline end-to-end (Tier 1 scripted) | 45–75s |
| Slack post latency (after agent completes) | < 2s |
| PDF/DOCX generation on download | < 3s |
| Vector similarity search over 40 deals | < 100ms |

## Security & safety notes

- The Slack bot token has scope only for posting to one channel and reading reactions. It cannot DM users, read other channels, or invite users.
- The Anthropic API key is server-side only.
- The Exa API key is server-side only.
- No PII in the mock data — all customer names are public companies (Notion, Anthropic, etc.) or fictional with disclaimers.
- The "submit your own deal" form does not store visitor input persistently. In-memory only, expires on session end.
- Rate limit `/api/run-review` to 3 runs per session per minute to prevent API key abuse if the demo gets shared widely.
