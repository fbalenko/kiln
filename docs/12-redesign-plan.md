# 12 — Redesign Plan v2 (Clay-aware IA)

> Phase 1 deliverable for the `redesign-v2` branch. This document is the design system and per-surface plan that Phase 2 will implement. Implementation does not start until the plan is explicitly approved.

---

## 0. What we're optimizing for

One reader: a deal-strategy operator at Clay who sees ~30 candidate demos this year. Anything that reads as "side project" or "consumer SaaS" loses her in five seconds. The artifact has to feel like the inside of a real deal-desk operator's daily tool — denser than current, more chrome, more data per screen, no marketing-site whitespace.

The current state on `redesign-v2` is structurally right (sidebar + dashboard + pipeline + deal detail with Mode 1/2) but visually under-cooked: the dashboard has vast empty stretches, the pipeline rows are missing operator data (AE owner, last activity, severity preview), Mode 2's synthesis card visually competes with the verdict, the 3-up context row has uneven heights, and the Mode 1 → Mode 2 transition is a hard swap.

Reference products: **Stripe Dashboard** (chrome density, KPI rail at top, table primacy) + **Clay's product UI** (table density, sidebar register, blue accent restraint, Inter at 13px). Match the *layout register* of these tools, not their brand.

---

## 1. Visual direction

**Three sentences.** The redesign turns Kiln from a minimal demo into a working operator surface: every screen earns its full width, the chrome (filter pills, sort dropdowns, breadcrumbs, toolbars) does real work instead of decorating, and color is reserved for severity and agent identity rather than UI flourish. The aesthetic register is Stripe Dashboard's KPI-rail-on-top + table-primacy applied to Clay's actual product UI density (13px body, 36–40px row heights, 1px subtle borders, 4–6px radii, no shadows on content surfaces). The Mode 1 → Mode 2 transition is a continuous reflow with `framer-motion`'s shared-layout animations rather than a fade-and-swap.

**Five principles** (in priority order — earlier rules win on conflict):

1. **Density without crowding.** Use the full width. Smaller body type (12–13px), tighter row heights (32–36px), 6–8px gaps inside cards. But preserve a 4-pt baseline rhythm and let related fields cluster — density is information per screen, not visual noise.
2. **Color is information, not decoration.** Clay-blue (`#3B82F6`) only on filled CTAs, links, and active state. Severity colors (emerald/amber/red) only on numerics. Agent identity colors only on 2px left-border accents and tab underlines. No gradients, no glows, no full-card colored fills.
3. **Tables before cards.** When data is comparable across rows (deals, agents, audit entries, similar deals), it goes in a table. Cards are for one-of-a-kind affordances.
4. **Operator chrome is functional or it doesn't ship.** Filter dropdowns must filter. Sort dropdowns must sort. Search must search. We remove visual-only chrome entirely rather than ship it cosmetically.
5. **Reserve, don't pre-build.** Clay-integration slots are framed structurally — a Clay tab next to Exa in the customer signals rail, an orchestrator substep slot, a fourth demo-banner variant — but the slots stay empty/disabled until the integration phase ships.

---

## 2. Design tokens

### 2.1 Spacing scale (4-pt baseline)

| Token | px | Use |
|---|---:|---|
| `space-0.5` | 2 | inline-stack between tightly-coupled glyphs |
| `space-1` | 4 | inside compact pills, badge inner spacing |
| `space-1.5` | 6 | row paddings in dense tables |
| `space-2` | 8 | card inner gap, button x-padding |
| `space-2.5` | 10 | toolbar height baseline |
| `space-3` | 12 | card padding, table row height baseline (32px = 12 + 8 + 12) |
| `space-4` | 16 | section padding on tablets |
| `space-5` | 20 | page padding |
| `space-6` | 24 | section gap (top-level rhythm) |
| `space-8` | 32 | page section break |

Note: this is a 25–30 % tightening of the current rhythm. The current `space-y-7 sm:space-y-8` between Mode 2 sections becomes `gap-5 sm:gap-6`.

### 2.2 Typography scale (Inter + JetBrains Mono — unchanged from current)

| Role | Size | Weight | Line-height | Tracking | Notes |
|---|---:|---:|---:|---:|---|
| Display (verdict big-number) | 24px | 600 | 1.0 | -0.01em | mono variant for numerics |
| H1 (page title) | 16px | 600 | 1.3 | -0.005em | matches Stripe Dashboard page titles |
| H2 (section header) | 13px | 600 | 1.3 | 0 | |
| H3 (sub-section) | 12px | 600 | 1.3 | 0 | |
| Body | 12.5px | 400 | 1.45 | 0 | down from current 13.5px baseline |
| Body emphasis | 12.5px | 500 | 1.45 | 0 | for medium-weight inline emphasis |
| Caption | 11px | 400 | 1.4 | 0 | timestamps, metadata sub-lines |
| Eyebrow / label | 10.5px | 500 | 1.3 | 0.06em uppercase | column headers, eyebrow tags |
| Mono (numerics) | 12.5px | 500 | 1.3 | 0 | always `tabular-nums` |
| Mono small (id/code) | 10.5px | 400 | 1.3 | 0 | review-id, deal-id, audit step-id |

A **single CSS variable change** in `app/globals.css` shifts the body baseline from `13.5px` to `12.5px` and pulls the entire UI into the denser register; per-component overrides remain.

### 2.3 Color tokens (additive — existing tokens unchanged)

Current `severity.ts` (good/neutral/warn/bad) and `agent-identity.ts` (Orchestrator/Pricing/ASC 606/Redline/Approval/Comms) are kept verbatim. Add two new functional colors for badge states that don't exist today:

| Token | Light hex | Use |
|---|---|---|
| `--state-cached` | `#0369A1` (sky-700) on `#E0F2FE` | "cached" replay indicator on Mode 1 cards & artifacts |
| `--state-live` | `#15803D` on `#DCFCE7` | "live" run indicator |
| `--state-posted` | `#3B82F6` on `#DBEAFE` | Slack posted |
| `--state-failed` | `#B91C1C` on `#FEE2E2` | error / retry needed |

These compose with severity tokens; severity is for measured numeric outcomes, state is for system state.

### 2.4 Component primitives (Tailwind class strings)

Codified so every refactored component pulls from one source.

| Primitive | Tailwind utility string |
|---|---|
| `card.base` | `rounded-md border border-border bg-card` |
| `card.padded` | `p-3 sm:p-3.5` (was `p-4 sm:p-5` — 25% tighter) |
| `card.header` | `flex items-baseline justify-between gap-3 border-b border-border px-3 py-2` |
| `card.section-header` | `text-[12px] font-semibold text-foreground` |
| `card.eyebrow` | `text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground` |
| `button.primary` | `inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white transition hover:bg-[var(--brand)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 disabled:opacity-50` |
| `button.secondary` | `inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[12.5px] font-medium text-foreground transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30` |
| `button.ghost` | `inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground transition hover:bg-surface-hover hover:text-foreground` |
| `button.toolbar` | `inline-flex h-7 items-center gap-1.5 rounded border border-transparent px-2 text-[12px] text-muted-foreground transition hover:border-border hover:bg-surface-hover hover:text-foreground` |
| `input.base` | `h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30` |
| `badge.outline` | `inline-flex h-5 items-center rounded-sm border border-border bg-card px-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground` |
| `badge.severity[good\|warn\|bad]` | uses existing `SEVERITY_CLASSES[*].bgTint` + `.text` + `.border`, height `h-5`, `text-[10.5px] uppercase tracking-wider` |
| `badge.state[cached\|live\|posted\|failed]` | bg + text from §2.3, rounded `rounded-sm`, `h-5 px-1.5 text-[10.5px] uppercase tracking-wider` |
| `table.row.base` | `grid items-center gap-3 px-3 py-1.5 text-[12.5px] hover:bg-surface-hover` (32px row min) |
| `table.row.dense` | `grid items-center gap-2.5 px-3 py-1 text-[12px] hover:bg-surface-hover` (28px row min — for audit log only) |
| `table.header` | `grid items-center gap-3 px-3 py-1.5 border-b border-border bg-surface-secondary text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground sticky top-0 z-10` |
| `table.striped-row` | `bg-surface-secondary/40` (apply on odd rows) |
| `panel.rail` | `rounded-md border border-border bg-card overflow-hidden` (right-rail card with internal scroll) |

Implementation: these strings live as named exports in `lib/ui-tokens.ts` (new). Components import the strings rather than inlining classNames. This avoids a CSS rebuild and stays compatible with the existing Tailwind v4 setup.

---

## 3. Per-surface redesign

### 3.1 Sidebar (light pass — `components/sidebar.tsx`)

Current 200px sidebar is fine. Three refinements:

- Width 200 → **216px** desktop (matches the 12-col grid math we use elsewhere).
- Wordmark area gets a 1px bottom divider and an inline workspace switcher chip (purely visual — "Kiln · Demo Workspace" with the brand-blue dot moved here, freeing the top header).
- Add a **collapsed state** behind a hover-hold (≥1280px viewports get a thin 56px rail variant when the user toggles it; mobile drawer behavior unchanged). Out of scope for v1 of the redesign — *plumbed only*.
- Section-label row above nav: `WORKSPACE` eyebrow, then Home/Pipeline/GitHub. Reserve a second eyebrow `MORE` below the GitHub link as the slot for future surfaces (Approvals editor, Audit, Submit flow).
- Footer: replace `v0.1 · Phase 2` with a one-line Slack workspace link (`# kiln-demo` with external arrow) — operators expect Slack adjacency.

Rationale: a 216px sidebar with a `WORKSPACE`/`MORE` two-section nav reads like Linear/Stripe/Clay. The current `v0.1 · Phase 2` footer reads as "side project."

### 3.2 Dashboard (`/`) — full redesign

Today: heading + 2 entry cards + 2-row surfaces table. ~70 % of the viewport is empty.

After: a **deal-pipeline-health dashboard** with five regions, computed live from `listDeals()` so it stays accurate across seed changes.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Deal desk overview                            [Submit your own ▸]  │  ← page header
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┐            │
│ │ In review│ ACV at   │ Needs    │ Avg cycle│ Clay-    │  ← KPI rail (5 tiles)
│ │   12     │  risk    │ CFO ap.  │   3.2    │ enriched │
│ │ 5 hero   │ $4.2M    │   3      │  biz d.  │  0 / 12  │
│ └──────────┴──────────┴──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────┐ ┌──────────────────────────────┐ │
│ │ Quick start (4 hero cards)     │ │ Recent activity (8 rows)     │ │
│ │  • Anthropic — strategic exp.  │ │  09:42  Synthesis · Anthr.   │ │
│ │  • Notion — mid-market         │ │  09:39  Slack · Tessera      │ │
│ │  • Tessera — startup squeeze   │ │  09:35  Verdict · Northbeam  │ │
│ │  • Northbeam — partner play    │ │  …                            │ │
│ │  [Browse all 40 deals →]       │ │                              │ │
│ └────────────────────────────────┘ └──────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│ Workspaces & views (unchanged 2-row table — kept as a footer)       │
└─────────────────────────────────────────────────────────────────────┘
```

**KPI tiles** (`<KpiRail>` — new component): each tile is `card.base` with eyebrow label, big-number mono value (24px tabular-nums), severity-colored sub-line. Severity comes from `lib/severity.ts` (e.g., "ACV at risk" uses `marginSeverity`-style thresholding by % of total ACV). On hover, the tile becomes a link to the matching pipeline filter (`/pipeline?stage=in_review`, `/pipeline?needs_approval=true`). Tile 5 is the **Clay-enriched counter** — disabled state today (`0 / 12`, muted), wired in the integration phase.

**Quick-start cards** (`<HeroQuickStart>` — replaces the current 2 entry cards): a 2×2 grid of the five hero scenarios as compact cards (icon + 1-line tagline + ACV + difficulty badge). Card 5 spans a full row at the bottom: "Browse all 40 deals →". Hard-navigation to `/deals/<id>` per existing convention.

**Recent activity feed** (`<ActivityFeed>` — new): a vertical list of the last 8 events derived from the `reviews` and `slack_posts` tables (synthesis fired, Slack post settled, verdict computed). Each row is a 28px-tall mono timestamp + agent dot + brief verb-phrase. This grounds the dashboard in the data model rather than fabricating activity. If the tables are empty (cold deploy), the panel shows an empty state with a "Run your first review" CTA.

**Workspaces & views** stays — a two-row table at the bottom is OK as a sparse footer.

Mobile: KPI rail collapses to horizontal-scroll snap (5 tiles, snap-x). Quick-start + activity stack vertically. Workspaces table unchanged.

### 3.3 Pipeline (`/pipeline`) — denser + functional chrome

Current pipeline already has the right register. Three changes:

**A) Functional toolbar.** Make `Stage:`, `Sort:`, and `View:` real dropdowns. The component is `<PipelineToolbar>` today; it becomes:
- `Default View ▾` — dropdown switching between *All deals*, *Hero scenarios only*, *Closed-won only* (mirrors the current static section split — we keep both sections visible by default, the dropdown is a power-user filter).
- `40 Deals · 11 Columns` — display-only counter, updates as filter changes.
- `Stage: All ▾` — multi-select dropdown over the 6 enum values. Selected stages render as removable pills inline (`Stage: Negotiating ✕  Renewal ✕`).
- `Sort: Display order ▾` — single-select over Display order / ACV (desc) / Term (desc) / Last activity (desc).
- New: `Search ▢` — text input filtering by customer name + deal name. `Cmd-K` focus.

Implementation: client component, in-memory filter/sort over the seeded list. No DB changes.

**B) Two new columns on desktop.**
- `AE` — owner avatar (initials chip from `deal.owner_name`, colored via deterministic hash) + name truncated. Width 88px.
- `Last activity` — relative time since last `reviews.created_at` for that deal (or "no activity" if none). Width 96px, mono.

The existing 6-column grid becomes 8-column at `lg` (≥1024px); mobile collapses identically to today. Total grid: `52px (#) | 1.1fr customer | 1.6fr deal | 88px ACV | 64px term | 88px AE | 96px last | 104px stage`.

**C) Severity preview column** — replaces the `Term` column at `xl` (≥1280px) with a 3-glyph severity strip showing approval / margin / redline indicators for that deal (computed from cached scenario outputs where present, blank otherwise). The hero rows show a glyph strip; the closed-won rows don't. Mobile and tablet keep the current Term column.

Hero "Start here" pulse stays. Difficulty badge stays. StageBadge stays.

### 3.4 Deal detail page — Mode 1 (running)

Today: header → metadata → Run-review button → vertical timeline. The visitor stares at a near-empty timeline for ~10–60 s while agents stream in.

After: **two-column workbench layout at ≥`lg`** (collapses to single-column below).

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Pipeline   ANTHROPIC · 2026 Multi-Year   ACV $1.5M · 36 mo · …   │  ← sticky header
├─────────────────────────────────────────────────────────────────────┤
│  Demo data · ...                                  [Why?]            │  ← banner (existing)
├──────────────────────────────────┬──────────────────────────────────┤
│ Deal context (left, 4 cols)      │ Reasoning timeline (right, 8 col)│
│ ┌──────────────────────────────┐ │ ┌──────────────────────────────┐ │
│ │ Customer  Pricing  Owners    │ │ │ ① Orchestrator · Running     │ │
│ │   tight metadata grid        │ │ │   ↳ fetch deal               │ │
│ │ Customer request quote       │ │ │   ↳ Clay enrichment (slot)   │ │
│ │ Non-standard clauses         │ │ │   ↳ fan out                  │ │
│ │ Competitive context          │ │ │ ② [Pricing | ASC 606 | RL]   │ │
│ ├──────────────────────────────┤ │ │ ③ Approval · Pending         │ │
│ │ Similar past deals (lands    │ │ │ ④ Comms · Pending            │ │
│ │ early via panel_data event)  │ │ │                              │ │
│ │ Customer signals + Clay tab  │ │ │ Run review  Re-run live (dev)│ │
│ └──────────────────────────────┘ │ └──────────────────────────────┘ │
└──────────────────────────────────┴──────────────────────────────────┘
```

Rationale:

- The visitor sees substantive **deal context** *and* a **live similar-deals panel** during the 30–60 s of timeline streaming. Currently these only appear in Mode 2; surfacing them in Mode 1 fills the empty whitespace and gives the visitor signal while the agents work.
- The timeline lives on the right side at desktop widths. Cards remain full-width on mobile.
- The "Run review" CTA moves above the timeline (right column) so it stays adjacent to the surface that will animate.

**New component slots:**
- `<ClayEnrichmentSubstep>` — a new substep entry inserted between `fetch_deal` and `step2_fanout` in the orchestrator's substep list. It renders as `disabled` today (a pending-glyph, "Clay enrichment — not connected"). The `lib/agents/orchestrator.ts` substep emitter will be touched only in the integration phase; in this redesign we add the substep visually in `ORCHESTRATOR_SUBSTEPS` with a `disabled: true` flag and the timeline component skips it during animation.
- `<ClaySignalsTab>` — sibling to the existing customer-signals panel; renders an empty state with "Clay enrichment will surface company size, funding, tech stack, leadership changes, and intent signals here. Not yet connected." plus a brand-colored coming-soon chip.

### 3.5 Deal detail page — Mode 2 (complete)

Today: verdict → synthesis (visually competing) → reasoning trace → tabs → 3-up panels (uneven heights) → artifacts → audit. The synthesis card's heavy blue border out-shouts the verdict.

After: **verdict-first, synthesis-as-subtitle, 12-col grid below.**

```
┌──────────────────────────────────────────────────────────────────────┐
│  sticky header (unchanged)                                           │
├──────────────────────────────────────────────────────────────────────┤
│  Verdict bar — 6 tiles full-width                                    │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┐                        │
│  │ Block│ 15.0%│ 21.0%│  5   │ Block│  5   │                        │
│  └──────┴──────┴──────┴──────┴──────┴──────┘                        │
│  Executive synthesis — single sentence inline (12.5px, italic accent)│
│  └─ "Block — three blockers: …" + [view audit log ▸]                │
├──────────────────────────────────────────┬───────────────────────────┤
│ Tabbed agent outputs (8 cols)            │ Context rail (4 cols)     │
│ ┌──────────────────────────────────────┐ │ ┌───────────────────────┐ │
│ │ Pricing · ASC606 · Redline · Appr… · │ │ │ Customer signals      │ │
│ │ identity-coloured underline          │ │ │  Exa | Clay (slot)    │ │
│ │ structured output card                │ │ ├───────────────────────┤ │
│ │ ...                                  │ │ │ Similar past deals    │ │
│ │                                      │ │ │  3 rows + sim score   │ │
│ │                                      │ │ ├───────────────────────┤ │
│ │                                      │ │ │ Slack post · #deal-…  │ │
│ │                                      │ │ │  posted · ts · link   │ │
│ └──────────────────────────────────────┘ │ └───────────────────────┘ │
├──────────────────────────────────────────┴───────────────────────────┤
│  Deal-desk artifacts — 5-tile grid full-width                        │
├──────────────────────────────────────────────────────────────────────┤
│  Audit log (collapsed)  ·  Reasoning trace (collapsed)               │
└──────────────────────────────────────────────────────────────────────┘
```

Specific changes vs. current Mode 2:

1. **Synthesis demoted.** The big blue-bordered synthesis card disappears. The synthesis sentence becomes a single inline line below the verdict bar — `12.5px italic text-foreground/85`, prefixed by the recommendation ("Block — three blockers: …"). The full multi-paragraph synthesis text moves into the audit log expansion. The verdict bar is now the unambiguous dominant surface.
2. **3-up → vertical right rail.** The 3-up grid (similar deals / customer signals / Slack) becomes a stacked right-column rail. Each rail card has its own internal scroll (`max-h-[320px] overflow-y-auto`) so the column heights don't get yanked by the longest panel. This fixes yesterday's "uneven heights" finding.
3. **Customer signals gets a tab strip.** Inside the customer-signals card, two tabs: `Exa` (existing) and `Clay` (disabled empty state). When Clay ships, the rail card title becomes "Customer profile" and the tabs survive.
4. **Tabs widen.** Agent output tabs go from 100 % width to 8/12 width, giving the structured cards (especially Pricing alternatives + ASC 606 schedule) more breathing room without growing the page.
5. **Artifacts panel stays full-width** (5 tiles in one row at desktop, 2-col on mobile). Add a `cached`/`live` badge on each tile reflecting whether the artifact came from a fresh review or the cached scenario tape.
6. **Audit + reasoning trace fold to a single row** at the bottom — two collapsed sections side by side (50/50 on desktop, stacked on mobile).

Tablet (`md`–`lg`): the right rail moves below the tabs as a horizontal 3-card row (the current 3-up layout, but with equal heights via `align-items: stretch` + internal scroll).
Mobile (`<md`): everything is single-column, rail cards stack below the tabs.

### 3.6 Mode 1 → Mode 2 transition (framer-motion)

Today: hard swap with a CSS fade. Loses spatial continuity — the timeline flickers out, verdict pops in.

After: a `LayoutGroup`-coordinated transition.

- The Mode 1 right-column timeline shrinks to a single thin **summary strip** ("✓ 5 agents · 14.2s · 47 substeps") that slots in *above* the audit-log row in Mode 2. `motion.div layout` with `transition={{ duration: 0.45, ease: "easeOut" }}`.
- The verdict bar fades up into its place from the top with a 12px translate, staggered against the synthesis line (60 ms delay).
- The agent output cards from Mode 1 (the parallel grid showing pricing/ASC606/redline at the moment they completed) **morph into the tabbed surface** — `layoutId="agent-output-pricing"` etc., so Pricing's card visually slides into the Pricing tab content area rather than being unmounted and remounted.
- The right-column right-rail panels (similar deals + customer signals) crossfade rather than animate position — they're already in the right column in both modes, so no movement needed.

Constraint: respect `prefers-reduced-motion` — collapse the whole transition to a 200 ms opacity crossfade.

Implementation hooks: framer-motion's `LayoutGroup` wraps the `<DealDetail>` body; `<ReasoningStream>` and `<CompletedView>` participate by tagging their key elements with matched `layoutId`s. No agent-code or SSE changes.

### 3.7 Artifacts panel (light pass)

Stays a 5-tile grid. Three additions:

- File-type icon gets the agent-identity color of the agent that produced the artifact (one-pager / order-form = Pricing blue, redlined MSA = Redline orange, AE email + customer email = Comms teal).
- Generated-at timestamp on each tile (`9:42 AM`, mono caption) — pulled from the review's `created_at`, so it's real data, not fabricated.
- Tile gains a `cached` or `live` state badge in the bottom-right corner. The badge maps to `--state-cached` / `--state-live` from §2.3.

No download-count mock — fabricating download counts erodes trust. Real timestamps + real cache state are the legitimate signals.

---

## 4. Clay-integration placeholders (reserve, don't build)

The next phase wires Kiln's orchestrator as an MCP client to Clay's MCP connector. The redesign reserves four structural slots:

| # | Slot | Where in the redesign | State today |
|---|---|---|---|
| 1 | **Clay tab** in the customer-signals card | §3.5 right rail, sibling to Exa tab | Disabled tab with an empty-state body. Brand-blue "Coming soon" chip. Not selectable. |
| 2 | **Clay enrichment substep** in the orchestrator timeline | §3.4 inserted between `fetch_deal` and `step2_fanout` in `ORCHESTRATOR_SUBSTEPS` | Rendered with a muted icon + "not connected" label, opacity-50, no animation. Skipped by the substep emitter. |
| 3 | **4th demo-banner variant** | `components/demo-data-banner.tsx` `Variant = "A"\|"B"\|"C"\|"D"` | Type added to the union; `pickVariant()` never returns `"D"` today. Copy block authored: *"Live Clay-enriched · this deal pulls real customer signals from Clay's MCP connector. Pricing guardrails and approval matrix are this demo's defaults, not Clay's actual policy."* |
| 4 | **Clay enrichment KPI tile** | §3.2 dashboard KPI rail, 5th tile | Renders `0 / 12` muted. When Clay ships, the count comes from a `deal_enrichments` table or live MCP call. |

No code path executes new Clay logic in this redesign. The integration phase fills these four slots without restructuring components.

---

## 5. Out of scope (do not touch)

These are off-limits for the redesign branch:

- **Agent code** — `lib/agents/*`, prompts in `lib/prompts/*.md`, schemas in `lib/agents/schemas.ts`, the SDK helper, the streaming behavior.
- **MCP servers** — `lib/mcp-servers/*`, tool wrapping.
- **Cache replay system** — `db/seed/cached_outputs/*`, the realistic-pace replay logic.
- **Document templates** — `lib/document-templates/*`, the artifact generation API route.
- **Slack integration** — `lib/tools/slack.ts`, the post & thread metadata.
- **Routing pattern** — parallel routes (`@modal`) + intercepting routes (`(.)`). Slide-over UX is preserved.
- **Phase 7-1 hardening** — `lib/agents/_helpers.ts` schema-retry, ASC 606 retries.
- **The demo arc** — every step from §0 of the brief stays. Reset button stays. Deep-linkability stays.
- **Severity tokens** (`lib/severity.ts`) — kept verbatim. New `state` colors are additive.
- **Agent identity tokens** (`lib/agent-identity.ts`) — kept verbatim.

If a real bug surfaces during the redesign work it goes into `/tmp/redesign-side-findings.md` for follow-up; we don't fix it on this branch.

---

## 6. Migration plan (ordered, with effort + risk)

Ordering is dependency-driven: primitives first so every later refactor pulls consistent classes. Each row produces one commit. Estimated effort assumes the dev environment is already set up.

| # | Step | Files touched | Effort | Risk | Verification |
|---|---|---|---:|---:|---|
| 1 | **Tokens** — write `lib/ui-tokens.ts` (primitive class strings), add `state-*` color vars + KPI/`tabular-nums` body baseline shift in `app/globals.css`. | `lib/ui-tokens.ts` *(new)*, `app/globals.css` | S | Low | `tsc`, build, manual visual check that fonts render. |
| 2 | **Sidebar light pass** — width 216, two-section nav, Slack footer, plumb collapsed-state but ship expanded-only. | `components/sidebar.tsx`, `components/app-shell.tsx` | S | Low | Snap dashboard + pipeline + deal pages on 1280 + 390. |
| 3 | **Dashboard rebuild** — KPI rail (`<KpiRail>`), quick-start cards (`<HeroQuickStart>`), activity feed (`<ActivityFeed>`), kept-as-is workspaces table. | `app/page.tsx`, `components/dashboard/*` *(new + replace)* | M | Med | `listDeals()` math correctness; KPI tile severity thresholds; activity feed empty state on cold DB. |
| 4 | **Pipeline densification** — functional toolbar, AE + last-activity columns, severity preview at xl, search input. | `app/pipeline/page.tsx`, `components/pipeline/*` | M | Med | Filter + sort + search behavior across 40 deals; mobile fallback to current grid; URL-state for filters not required v1. |
| 5 | **Mode 1 workbench** — two-column layout, deal context to the left, similar-deals + customer-signals panels surface in Mode 1, Clay enrichment substep slot. | `components/deal/deal-detail.tsx`, `components/reasoning-stream.tsx`, `components/panels/*` | M | Med | SSE stream still drives the timeline; context panels render their skeleton states correctly; cache replay still paces. |
| 6 | **Mode 2 verdict-first layout** — synthesis demoted, right rail with internal scroll, customer-signals tabs (Exa/Clay), tabs widened to 8/12. | `components/deal/completed-view.tsx`, `components/verdict-card.tsx` (no schema changes), new `<RightRail>` shell. | L | Med | All five tabs still switch; 3-up height bug resolved; mobile single-column flow; tab content unchanged. |
| 7 | **framer-motion transition** — `LayoutGroup` + matched `layoutId`s for verdict, synthesis, agent cards. Reduced-motion fallback. | `components/reasoning-stream.tsx`, `components/deal/completed-view.tsx` | M | Med | Transition never blocks the synthesis event; reduced-motion test path; no `useLayoutEffect` warnings. |
| 8 | **Artifacts panel polish** — agent-identity icon colors, generated-at timestamps, cached/live state badge. | `components/artifacts-panel.tsx` | S | Low | All 5 downloads still work end-to-end; timestamp formatting in correct locale. |
| 9 | **Demo-data banner Variant D plumbed** — extend `Variant` union, add Variant D copy, leave `pickVariant()` returning A/B/C only. | `components/demo-data-banner.tsx` | XS | Low | `tsc`. |
| 10 | **Final puppeteer pre/post diff** — re-run `scripts/capture-before.ts` against the new code into `/tmp/redesign-comparison/`; manual diff vs `/tmp/redesign-before/`. | `scripts/capture-after.ts` *(new)* | S | Low | Every download still works; every Slack link still works; every tab still switches; mobile readable at 390. |

Approximate total: 6–8 commits across one focused session. No commit lands without `npm run build` clean and `npx tsc --noEmit` clean.

---

## 7. Open questions for review

Items the brief flagged as needing the skill's recommendation. The default below ships unless overridden.

1. **Mode 2 layout choice** (brief offered "left rail + main + right rail" vs "packed top-down"). **Default proposed:** verdict bar full-width on top + 8/4 split below (tabs left, vertical context rail right). This is the hybrid; full 3-pane felt too JIRA-like for a deal-desk artifact.
2. **Sidebar collapsed state** — plumbed but not shipped. Default: leave hover-toggle for a follow-up phase. Rationale: not a blocker for the operator-feel goal, and adds animation complexity.
3. **Mock download counts on artifacts** — brief suggests adding them. **Default proposed:** skip. Real timestamps + real cache state are stronger; fabricated counts erode trust if the operator looks twice.
4. **URL-state for pipeline filters** (`?stage=…`). **Default proposed:** skip for v1 — in-memory state only. Cheap to add later if the operator wants deep-linked filtered views.
5. **Activity feed source** — derived from `reviews` + `slack_posts` tables. If a cold deploy returns no rows, the feed shows an empty state. Acceptable, or seed 5–10 fake recent rows? **Default proposed:** real-data-or-empty-state. Fewer ghosts in the demo.

If any of these defaults aren't right, flag during plan review and we adjust before Phase 2.
