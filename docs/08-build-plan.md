# 08 — Build Plan

This is the master plan Claude Code follows phase by phase. Each phase is a self-contained chunk that ends with a deployable, demo-able state.

> **Rule**: Do not start Phase N+1 until Phase N is complete and committed. Phases are dependency-ordered — earlier phases build the infrastructure later phases rely on.

> **Operating directive (reminder)**: You are in `bypassPermissions` mode. Do not ask before installing packages, creating files, running migrations, or committing. State the action, do it, move on.

---

## Phase 0 — Bootstrap

**Goal**: Empty Next.js app running on localhost. End state: visit `http://localhost:3000` → see "Hello Kiln" page styled.

**Tasks**:
1. `npx create-next-app@latest kiln --typescript --tailwind --app --src-dir=false --import-alias="@/*" --eslint`
2. Install core dependencies:
   - `npm i @anthropic-ai/claude-agent-sdk @slack/web-api exa-js better-sqlite3 sqlite-vec zod openai`
   - `npm i -D @types/better-sqlite3`
3. Initialize shadcn/ui: `npx shadcn@latest init` (select defaults, neutral palette, CSS variables yes)
4. Install initial shadcn components: `npx shadcn@latest add button card badge input textarea dialog tabs slider tooltip table`
5. Verify `.env.local` exists with the API keys already populated (the user set this up before launching Claude Code). If not, halt and ask.
6. Verify `.env.example` and `.gitignore` are present and `.env.local` is gitignored
7. Configure `tailwind.config.ts` with the Kiln palette from `docs/05-ui-ux.md`
8. Configure fonts: Inter from Google Fonts, JetBrains Mono for monospace
9. Build a minimal homepage that says "Kiln" centered, monospace
10. Initialize git, commit. Push to a new GitHub repo `fbalenko/kiln` (public) using `gh repo create fbalenko/kiln --public --source=. --push`
11. Run `npm run dev` and verify `http://localhost:3000` renders the styled homepage

**Done when**: `npm run dev` starts cleanly, `http://localhost:3000` renders a styled "Kiln" homepage, and the repo exists on GitHub. **Deployment is deferred to Phase 10** — all subsequent phases run against localhost.

---

## Phase 1 — Database + Mock Data

**Goal**: SQLite schema in place, all 40 seeded deals + customers + guardrails + matrix rules loaded. Reading deals from the DB works via a debug API route.

**Tasks**:
1. Create `lib/db/client.ts` — better-sqlite3 singleton with sqlite-vec extension loaded
2. Create migrations 001–003 (schema from `docs/02-data-model.md`)
3. Create migration runner that runs on app boot if not already applied (track applied migrations in a `_migrations` table)
4. Create `db/seed/customers.ts` — 30+ customers with realistic profiles
5. Create `db/seed/scenarios/01-anthropic-expansion.ts` through `05-agency-partnership.ts` — fully detailed per `docs/04-scenarios.md`
6. Create `db/seed/deals.ts` — 35 additional deals (8 closed_won, 5 closed_lost, plus discovery/proposal/negotiation stages) with realistic data
7. Create `db/seed/guardrails.ts` — 8–12 pricing guardrails covering common SaaS patterns
8. Create `db/seed/approval-matrix.ts` — 6–10 matrix rules covering ACV thresholds, discount thresholds, non-standard clause triggers
9. Create `db/seed/run-seed.ts` — single command to populate everything
10. Create `npm run seed` script
11. Create `lib/db/queries.ts` — type-safe query helpers (`getDealById`, `listDeals`, `getApprovalMatrix`, etc.)
12. Create debug API route `app/api/debug/deals/route.ts` that returns all deals as JSON
13. Run seed, verify via debug route, commit DB file
14. Build and deploy. Verify the API route works on Vercel.

**Done when**: `http://localhost:3000/api/debug/deals` returns 40 deals. Deals look real when scanned visually.

---

## Phase 2 — Pipeline View + Deal Detail Skeleton

**Goal**: Visitor can navigate from `/pipeline` to `/deals/[id]`. Deal detail page renders deal metadata. No agents yet.

**Tasks**:
1. Build `/pipeline` page with the table layout from `docs/05-ui-ux.md`
2. Highlight scenarios at top, closed deals below
3. "Start here" tag with pulsing dot on Scenario 1 (the Anthropic-shaped expansion)
4. Each row clickable → navigates to `/deals/[id]`
5. Build `/deals/[id]` page with:
   - Sticky deal header (customer, deal name, ACV, term, stage)
   - Empty "Review" placeholder showing 6 collapsed timeline rows
   - "Run review" CTA button
6. Mobile-responsive (test on a 6" viewport in browser dev tools)
7. Deploy. Verify on actual mobile phone.

**Done when**: Pipeline → click → deal detail flow works on mobile. Deal headers populate from real seed data.

---

## Phase 3 — Single Agent Working End-to-End

**Goal**: One sub-agent (Pricing) runs against one deal and produces a structured output. Streaming works. Audit log writes.

**Tasks**:
1. Create `lib/agents/pricing-agent.ts` with the Pricing Agent prompt + Zod schema
2. Create `lib/prompts/pricing-agent.md` with the actual prompt content
3. Create `lib/tools/crm.ts` — MCP tool functions (`get_deal`, `get_pricing_guardrails`)
4. Create `app/api/run-review/[dealId]/route.ts` — SSE endpoint
5. For now, only run the Pricing Agent (skip the others)
6. Stream events as the agent reasons; persist final output to `deal_reviews` and `audit_log`
7. On the deal detail page, build `<ReasoningStream>` component that connects to SSE and renders the streaming events
8. Build `<AgentOutputCard>` for the Pricing output specifically (the structured fields from `PricingOutputSchema`)
9. Wire "Run review" button to start the SSE stream
10. Test against Scenario 1 (Anthropic). Verify the output is sensible.

**Done when**: Click scenario → "Run review" → watch Pricing Agent reason in real time → see structured output → audit log row exists in DB.

---

## Phase 4 — All 5 Sub-agents + Orchestrator

**Goal**: Full pipeline runs. All five sub-agents working. Orchestrator dispatches in parallel where appropriate.

**Tasks**:
1. Create `lib/agents/asc606-agent.ts` + prompt
2. Create `lib/agents/redline-agent.ts` + prompt
3. Create `lib/agents/approval-agent.ts` + prompt
4. Create `lib/agents/comms-agent.ts` + prompt
5. Create `lib/agents/orchestrator.ts` with the execution plan from `docs/03-agents.md` §Orchestrator
6. Update `app/api/run-review/[dealId]/route.ts` to dispatch via orchestrator
7. Build remaining agent output cards in the UI
8. Implement the synthesis summary card (4-sentence executive overview)
9. Cache hero scenario outputs in `db/seed/cached_outputs/` to ensure demo determinism
10. Test all 5 scenarios. Each should produce a sensible, internally-consistent review.

**Done when**: All 5 hero scenarios run end-to-end and produce coherent reviews in 45–75 seconds.

---

## Phase 5 — Vector Search + Exa + Customer Signals

**Goal**: Similar past deals panel populated. Customer signals appear. Both feeds visible in the deal review UI.

**Tasks**:
1. Create `lib/db/embeddings.ts` — embedding generation + storage in sqlite-vec virtual table
2. Update seed script to embed all 40 deals on first run
3. Create `lib/tools/vector-search.ts` MCP tool — k-NN over `deal_embeddings`
4. Wire vector search into orchestrator (parallel with Exa)
5. Create `lib/tools/exa-search.ts` MCP tool with caching
6. Wire Exa into orchestrator
7. Build `<SimilarDealsPanel>` and `<CustomerSignalsPanel>` components
8. Test on all 5 scenarios. Verify similar-deals-returned makes sense.

**Done when**: Each scenario shows 3 similar deals + 3-5 customer signals. Visitor can click a similar deal to navigate.

---

## Phase 6 — Slack Integration

**Goal**: Real Slack post fires when a deal review completes. Demo workspace populated. Embed visible in UI.

**Tasks**:
1. Create the `kiln-demo` Slack workspace (one-time, manual)
2. Seed channels with 30–50 fake messages of channel history
3. Create the Slack app, install bot, get token
4. Add bot to `#deal-desk`
5. Set env var `SLACK_BOT_TOKEN` and `SLACK_DEAL_DESK_CHANNEL_ID`
6. Create `lib/tools/slack.ts` MCP tool — Block Kit construction + posting
7. Wire orchestrator to post the deal review on synthesis complete
8. Build `<SlackEmbed>` component (iframe or screenshot+link)
9. Add "Join the demo Slack" button with the invite link
10. Add the welcome message to `#general` per `docs/07-extra-features.md` §8

**Done when**: Running a scenario posts a styled review to the demo workspace. Visitor can join the workspace via one click.

---

## Phase 7 — Document Generation + Submit Your Own Deal

**Goal**: Visitor can download artifacts. Tier 3 (submit your own deal) works end-to-end.

**Tasks**:
1. Create `lib/document-templates/redlined-msa.ts` — DOCX with tracked changes
2. Create `lib/document-templates/order-form.ts` — PDF
3. Create `lib/document-templates/approval-one-pager.ts` — PDF
4. Create `lib/document-templates/ae-email.ts` — markdown + .eml export
5. **Create `lib/document-templates/spreadsheet/` — xlsx workbook with 10 tabs and live formulas. Read `docs/10-sheets-integration.md` first. This is the artifact that addresses the JD's Excel/Sheets/financial modeling/ASC 606 requirements simultaneously.**
   - 5a. `index.ts` — main `generateDealSpreadsheet(review)` function
   - 5b. `tab-deal-summary.ts`, `tab-pricing-model.ts`, `tab-asc606-schedule.ts`, `tab-alternatives.ts`, `tab-approval-routing.ts`, `tab-approval-matrix.ts`, `tab-pricing-guardrails.ts`, `tab-similar-deals.ts`, `tab-comp-analysis.ts`, `tab-audit-log.ts`
   - 5c. Critical: use real cell formulas (not pre-computed values). Cross-tab references on the Pricing Model and ASC 606 tabs. Conditional formatting for severity. Test by opening the .xlsx in Excel and editing the discount cell — the rev rec schedule must recalculate.
6. Build `<ArtifactsPanel>` with 5 download buttons (was 4)
7. Wire downloads to `app/api/artifacts/[dealId]/[type]/route.ts` (`type` accepts: `msa`, `order-form`, `email`, `one-pager`, `spreadsheet`)
8. Build `/submit` page with the structured form from `docs/05-ui-ux.md`
9. Create `app/api/submit-deal/route.ts` — POST handler, in-memory deal creation, embedding generation, orchestrator dispatch
10. Add session cookie management (signed cookie with visitor session ID)
11. Test the full flow: submit → redirect to `/deals/visitor-<sessionId>` → watch agents run on the visitor's deal → download all 5 artifacts and verify each opens correctly

**Done when**: All 5 artifacts downloadable. The .xlsx opens in Excel/Sheets/Numbers and the formulas actually recalculate when inputs change. Submit-your-own-deal produces a real review.

---

## Phase 8 — Extra Features

**Goal**: Pricing modeler, audit log, approval matrix editor, customer health score, CPQ comparison, eval harness, **live Google Sheets integration**, replay button, Slack welcome message.

Build in the order listed in `docs/07-extra-features.md` §Build Order. Every feature ships.

**Tasks (in order)**:
1. Pricing Modeler component + math library
2. Audit Log UI component (data already exists from Phase 3)
3. Approval Matrix Editor + `/approval-matrix` page
4. Customer Health Score field on customer records + display + Pricing/Comms agent prompt updates
5. CPQ Comparison Panel
6. Eval Harness + `/eval` page
7. **Live Google Sheets integration — see `docs/10-sheets-integration.md` §Tier 2. Set up GCP project, service account, master template Sheet, env vars, then build the "Open as live Google Sheets model" button + `app/api/sheets/[dealId]/route.ts`.**
8. Replay button
9. Slack welcome message

**Done when**: As many extra features as fit in the day are shipped and tested.

---

## Phase 9 — Polish + Deliverables

**Goal**: The artifact looks production-grade. Repo README is publishable. "If we built this in Clay" appendix is written. The in-app `/how-it-works` showcase page is built.

**Tasks**:
1. Polish pass: spacing, alignment, mobile rendering on actual phone (iPhone + Android)
2. Empty/loading/error states reviewed and improved
3. Write public-facing repo `README.md` (different from spec README — see `docs/09-deliverables.md`)
4. **Build `/how-it-works` page per `docs/11-how-it-works-page.md`. Read that doc first — it contains the full section list, the 3 Mermaid diagrams, all table contents, and the worked example timeline. Install `mermaid` and `shiki`, render the 3 diagrams (architecture flowchart, dispatch sequence, data model ERD), populate every table with live data pulled from the actual seeded scenarios, verify all section anchor links scroll-jump correctly, and link the page from the top nav of every other page.**
5. Write `/if-clay-built-this` page with the appendix content from `docs/09-deliverables.md`
6. Write deal desk policy template document, host as PDF download
7. Add OG image and meta tags for social link previews
8. Add Plausible/Vercel Analytics (privacy-respecting) so we can see if the HM clicks the link
9. Final SEO/structured data
10. Performance audit: Lighthouse score > 90 on mobile

**Done when**: Repo is publishable. Visitor experience is polished. All deliverables exist. The `/how-it-works` page renders all three diagrams correctly and the worked-example timeline reflects the actual Anthropic scenario output.

---

## Phase 10 — Deploy + Final Test

**Goal**: Live public URL. Full visitor flow tested fresh on the deployed site. Deploy is locked.

**Tasks**:
1. Push final commits to GitHub
2. Sign into Vercel, click "Add New → Project", import the `fbalenko/kiln` repo
3. Configure project settings: framework Next.js (auto-detected), build command default, output directory default
4. Add all env vars from `.env.local` to Vercel's environment variables (Production scope): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `EXA_API_KEY`, `SLACK_BOT_TOKEN`, `SLACK_DEAL_DESK_CHANNEL_ID`, `NEXT_PUBLIC_APP_URL` (set this to the Vercel URL once you have it)
5. Deploy. First deploy takes ~2 minutes. Verify the URL renders.
6. Re-deploy with the corrected `NEXT_PUBLIC_APP_URL` env var pointing at the actual deployed URL
7. Re-test the full demo flow on the live URL:
   - Desktop Chrome
   - Mobile Safari (iPhone)
   - Mobile Chrome (Android)
   - Desktop Firefox (sanity)
8. Verify all 5 hero scenarios run end-to-end on production
9. Verify Slack post fires from production (check #deal-desk in real time)
10. Verify all 5 generated artifacts download correctly from production
11. Have one trusted person (not Filip) test the full flow cold and report friction
12. Address any friction items
13. Final commit. Tag `v1.0`. Lock the deploy.
14. Prepare the friend's outbound message (in `docs/09-deliverables.md`)
15. **(Optional) Record Loom** per `docs/09-deliverables.md` §Loom Script. Skip without guilt if the live tool stands on its own.

**Done when**: The live URL works on every browser tested. A cold tester can land, run a scenario, submit their own deal, and download an artifact in under 5 minutes without help. Friend's message is drafted and ready to send.
