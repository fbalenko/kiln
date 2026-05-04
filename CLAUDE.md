# CLAUDE.md — Primary Context for Claude Code

> This file is automatically loaded by Claude Code at the start of every session. It is the single source of truth for project rules, conventions, and operating mode. Read it once, then follow `docs/08-build-plan.md` phase by phase.

---

## 0. Operating mode (read this first)

You are operating in **fully autonomous mode** for this project. The user has explicitly opted into `bypassPermissions` and does not want to be interrupted for routine edits, file creations, dependency installs, or shell commands.

**Do not ask for permission.** Do not say things like "Would you like me to..." or "Should I go ahead and...". Just execute. The only times you should pause and ask are:

1. A genuinely ambiguous product decision that materially changes the artifact (e.g., "should the approval matrix support custom JSON config or only the UI editor?")
2. A destructive action affecting files outside the `kiln/` directory
3. A choice between two architecture paths where both are viable and the trade-off is real

For everything else — install the package, write the file, run the build, commit, deploy. Move.

When you finish a phase, do not stop and wait. State what you finished in one line, then start the next phase.

---

## 1. What you're building

**Kiln** — a multi-agent deal desk co-pilot designed as the centerpiece of a referral-routed job application to Clay's Deal Strategy & Ops team. It must:

- Run end-to-end on a hosted URL with zero auth
- Render correctly on a 6" phone screen
- Let a first-time visitor see the system do real work in under 60 seconds
- Allow the visitor to submit their own deal and watch the agent run on it
- Post live to a real demo Slack workspace
- Be open-sourced under a permissive license with a proper README

**The audience is one specific person**: the hiring manager for the Deal Strategy & Ops role at Clay. Every design decision should be evaluated against the question *"does this make the HM more likely to take the meeting?"*

---

## 2. Project documents (read in order when relevant)

When you start a task, consult the relevant doc(s) **before writing code**.

| Doc | Purpose | Read it when |
|---|---|---|
| `docs/00-overview.md` | Product spec, demo arc, success criteria | Always — this is the "why" |
| `docs/01-architecture.md` | System design, tech stack, deployment | Before scaffolding any service |
| `docs/02-data-model.md` | DB schema, mock CRM data spec | Before touching the data layer |
| `docs/03-agents.md` | Orchestrator + 5 sub-agents (prompts, contracts) | Before writing any agent code |
| `docs/04-scenarios.md` | The 5 hero scenarios in deep detail | When seeding mock data; when building the demo flow |
| `docs/05-ui-ux.md` | Three-tier interaction model, design system | Before any frontend work |
| `docs/06-integrations.md` | Slack, Exa, vector search, document generation | Before wiring an integration |
| `docs/07-extra-features.md` | Pricing modeler, approval editor, CPQ compare, eval harness, audit, health score | Phase 4+ |
| `docs/08-build-plan.md` | Day-by-day phased build plan | At the start of every session |
| `docs/09-deliverables.md` | Policy doc, "if we built this in Clay", repo README, Loom script | Phase 9 |
| `docs/10-sheets-integration.md` | Excel `.xlsx` generation + live Google Sheets integration | Phase 7 (xlsx) and Phase 8 (Sheets) |
| `docs/11-how-it-works-page.md` | Spec for the in-app `/how-it-works` page (diagrams, agent table, worked example) | Phase 9 |

---

## 3. Tech stack (locked — do not deviate without asking)

- **Language**: TypeScript everywhere
- **Framework**: Next.js 15 (App Router) — frontend + API routes in one app
- **UI**: Tailwind CSS + shadcn/ui components
- **Database**: better-sqlite3 (single-file SQLite, zero setup)
- **Vector store**: sqlite-vec extension on the same SQLite DB
- **Agent framework**: `@anthropic-ai/claude-agent-sdk`
- **Slack**: `@slack/web-api`
- **Web research**: Exa API (`exa-js`)
- **PDF generation**: `pdfkit` or `pdf-lib`
- **DOCX generation**: `docx` package (for redlined MSA)
- **Deployment**: Vercel (frontend + API routes); SQLite committed to repo for demo determinism
- **Streaming**: Server-sent events for the live agent reasoning visualization

Do **not** introduce: Postgres, Redis, Docker, microservices, GraphQL, tRPC, custom auth, payment processors. This is a single Next.js app with a SQLite file. Keep it that way.

### 3a. Agent SDK usage pattern (Phase 3+)

Every sub-agent and the orchestrator are driven through `@anthropic-ai/claude-agent-sdk`'s `query()` — never `@anthropic-ai/sdk` directly. The SDK is the framework even when an individual agent is a leaf-node reasoning task with no tool loop (Pricing in Phase 3 is exactly that shape).

Canonical agent shape (`lib/agents/<name>.ts`):

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { crmMcpServer, CRM_TOOL_NAMES } from "@/lib/mcp-servers/crm-server";

const session = query({
  prompt: userMessage,                 // structured deal payload as JSON in markdown
  options: {
    model: "claude-sonnet-4-6",        // or claude-opus-4-7 / claude-haiku-4-5-20251001
    systemPrompt: readFileSync(promptPath, "utf-8"),
    tools: [],                         // disable built-in Claude Code tools
    mcpServers: { crm: crmMcpServer }, // wire MCP servers even if not exercised yet
    allowedTools: [...CRM_TOOL_NAMES], // pre-approve so no permission prompts
    settingSources: [],                // hermetic — no ~/.claude or .claude/settings bleed
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    thinking: { type: "disabled" },    // skip adaptive thinking warmup (5x faster on Sonnet 4.6)
    effort: "low",                     // bounded reasoning — these are leaf agents, not autonomous
    maxTurns: 2,                       // headroom for one tool call, then must answer
  },
});

for await (const msg of session) {
  if (msg.type === "result" && msg.subtype === "success") {
    return parseSchema(msg.result);    // Zod parse → typed PricingOutput / Asc606Output / etc.
  }
}
```

MCP servers live in `lib/mcp-servers/<name>-server.ts` and are built with `createSdkMcpServer({ tools: [tool(...)] })`. Tool handlers wrap the queries layer (`lib/db/queries.ts`). Even when the Phase 3 Pricing Agent feeds data inline via the user message, the `crm` server is registered so Phase 4's orchestrator can call `mcp__crm__get_deal` / `mcp__crm__get_pricing_guardrails` to gather context. Tool names are namespaced as `mcp__<server-name>__<tool-name>` — pass them in `allowedTools` to skip permission prompts.

Note on temperature: the Agent SDK does not expose `temperature` directly. Determinism for the demo comes from file-based caching in `db/seed/cached_outputs/<deal_id>-<agent>.json` (per `docs/03-agents.md §Determinism`), not from sampling control. Set `thinking: disabled` + `effort: low` on bounded reasoning agents to keep latency and tokens predictable.

---

## 4. Repo conventions

- **All paths absolute from repo root** in docs and code references.
- **TypeScript strict mode on**. No `any` unless there's a comment explaining why.
- **Server components by default**. Use `"use client"` only when a component needs browser APIs or interactive state.
- **API routes live in `app/api/*`**.
- **Database migrations** are plain SQL files in `db/migrations/` numbered `001_*.sql`, `002_*.sql`. Run them in order on app boot.
- **Seed data** lives in `db/seed/*.ts`. Each scenario gets its own seed file.
- **Agents** live in `lib/agents/*.ts` — one file per sub-agent + one for the orchestrator.
- **Prompts** live in `lib/prompts/*.md`. Never hardcode prompts in agent code; import them from the markdown files. This makes them grep-able, version-controllable, and forkable by Clay.
- **Component naming**: `PascalCase.tsx`. **Utility naming**: `kebab-case.ts`.
- **No CSS modules. No styled-components.** Tailwind utilities only.
- **No emoji in code or UI** unless explicitly specified in the design doc.

---

## 5. Quality bar

This is a high-stakes artifact. The HM is going to evaluate code quality if they look at the repo. Treat every commit as if it'll be read.

- **Reasoning legibility over cleverness.** When the agent produces output, the reasoning trace must be visible in the UI. Hidden chain-of-thought = chatbot. Visible structured reasoning = engineering.
- **No fake loading states.** If something takes <300ms, don't show a spinner. If it takes >8s, show partial output as it streams.
- **Realism in mock data is non-negotiable.** Generic placeholder text ("Lorem ipsum customer requesting standard discount") sinks the artifact. Every deal in the seed must feel like it could have come from Clay's actual pipeline.
- **One copy-pasteable URL per scenario.** Every demo path should be deep-linkable.
- **Reset button is required.** If the visitor breaks something exploring, one click puts them back at the pipeline view.

---

## 6. Anti-patterns (don't do these)

- ❌ Streaming raw model output to the screen ("AI slop" — looks unserious). Stream **structured outputs** as they're generated.
- ❌ Free-text input as the primary interaction. Use structured forms.
- ❌ Auth gates of any kind. The visitor should never see a login page.
- ❌ "Coming soon" or stub pages. If a feature isn't ready, don't link to it.
- ❌ Splashy AI gradients, glassmorphism, or overdesigned landing pages. Aim for the Linear/Stripe/Mercury aesthetic.
- ❌ More than 3 tools in the AI/Engineering hero stack. Keep it focused.
- ❌ Building features not specified in the docs. If you have an idea, surface it; don't ship it without alignment.

---

## 7. Where to put state

- **Visitor session state** (which scenarios they've run, their custom deal submission): in-memory on the server, keyed by a cookie. No DB persistence needed; resets on deploy are fine.
- **The mock CRM data** (deals, customers, history): SQLite, committed to the repo. Same DB file every visitor sees.
- **Generated artifacts** (PDFs, DOCXs, Slack post payloads): regenerated on demand from the agent output, not stored.
- **The Slack workspace**: a real workspace; the bot token lives in env vars.

---

## 8. Required environment variables

```
ANTHROPIC_API_KEY=...
EXA_API_KEY=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_DEAL_DESK_CHANNEL_ID=C...
NEXT_PUBLIC_APP_URL=http://localhost:3000   # update to deployed URL at Phase 10
OPENAI_API_KEY=...                          # for embeddings (text-embedding-3-small)

# Phase 8 only — live Google Sheets integration; safe to leave unset until Phase 8
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=...      # base64-encoded service account JSON
GOOGLE_DRIVE_FOLDER_ID=...                  # the "Kiln Demo Workbooks" folder ID
GOOGLE_SHEETS_TEMPLATE_ID=...               # the master 10-tab template Sheet ID
```

A `.env.example` must be committed at the root. The real `.env.local` must be gitignored.

---

## 9. When in doubt

If you encounter a decision the docs don't cover, the heuristic is:

> *"Will this make the hiring manager more likely to take the meeting after seeing it?"*

If yes → ship it. If no → leave it out. If you can't tell → ask.

---

## 10. First action when starting a session

1. Read `docs/08-build-plan.md` to identify the current phase.
2. Read the docs that phase references.
3. Run `git status` and `git log -5 --oneline` to see where things stand.
4. Begin work. Do not narrate. Do not ask. Execute.
