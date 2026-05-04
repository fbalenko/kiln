# 05 — UI / UX

## The three-tier interaction model

Every visitor enters at Tier 1. Some progress to Tier 2. Few reach Tier 3. The funnel is:

```
TIER 1: Watch one scenario unfold     (30s, zero effort)    → ~100% of visitors
TIER 2: Probe the output              (2–3min, low effort)  → ~50% of visitors
TIER 3: Submit their own deal         (5–10min, real effort) → ~25% of visitors
```

Each tier is a complete experience on its own. We design tiers, not pages.

---

## Tier 1: The first 60 seconds

### Landing page = `/` (dashboard)

There is **no marketing landing page**. The root URL `/` is a Clay-shaped dashboard with a "Welcome to Kiln" heading, a row of entry-point cards (each card = one thing the visitor can do right now), and a Clay-style table list of available surfaces. The dashboard's primary entry-point card opens the recommended hero scenario; a secondary card opens the full pipeline.

The dashboard cards intentionally use **hard navigation** (`<a href>`) to deal pages — they take the visitor to the standalone deal review page, not the slide-over. That signals "this is the real surface, not a preview."

Cards/links **only** point to pages that exist today (per CLAUDE.md anti-pattern: no stub links). Each new phase that ships a new surface adds a card here.

### What they see (mobile-first)

Persistent app chrome (every page):
- **Left sidebar** (~200px wide on desktop, drawer behind hamburger on mobile): wordmark "Kiln · where clay gets fired into final form", icon+text nav (Home, Pipeline, GitHub external), active item gets a subtle `bg-surface-hover` highlight (no border accent).
- **Top-right workspace badge**: ambient identity chip ("Demo Mode · Kiln Workspace" with a small pulsing brand-blue dot). Non-interactive.

The pipeline page (`/pipeline`) below the chrome:
- A single tagline sentence at the top: *"A multi-agent deal desk co-pilot, built for Clay's Deal Strategy & Ops team."*
- A **toolbar above the table** mimicking Clay's table-view chrome: "Default View · 40 Deals · 11 Columns" on the left; ghost buttons "Stage: All ▾" and "Sort: Display order ▾" on the right. Filter / Sort can be visual-only this phase ("shallow but present"); they get wired up in later phases.
- A **Clay-style table grid** with a row-number gutter on the left (small, monospace, muted gray), column headers carrying lucide-react type icons (Building2 for customer, FileText for deal name, DollarSign for ACV, Calendar for term, Tag for stage), and rows that collapse to a flex layout on mobile (no horizontal overflow at 390px).
- 5 hero scenarios at the top, each with a colored difficulty badge (medium → muted, high → amber, expert → brand-blue), the customer name, the deal headline, and a stage badge on the right.
- One scenario has a subtle pulsing dot + "Start here" tag in **brand-blue** at the top-left of the row.
- Below the 5 hero scenarios: "Past deals (closed-won)" — 8 historical deals in a slightly muted style with a **brand-blue ✓ Won** badge (not green) — Clay's accent.

### What happens on click

- The visitor taps a pipeline row.
- Next.js intercepts the navigation and opens `/deals/<id>` as a **right-side slide-over panel** (≈90% of viewport width on desktop, full-screen on mobile). The pipeline stays mounted underneath through a 10–15% dimmed scrim on the left. The URL updates to `/deals/<id>` so deep-linking works.
- The slide-over closes via the X button in its top bar, the ESC key, a click on the dimmed scrim, or the browser back button — all routed through `router.back()`.
- A **direct URL hit** to `/deals/<id>` (paste, refresh, link in dashboard) renders the deal as a full standalone page with the sidebar still visible — no slide-over.
- Inside the panel: a static deal header (sticky at the top), the customer/pricing/owners metadata cards, the customer-request panel with the verbatim AE quote + non-standard clause pills + competitive context, and an empty "Review" section showing a vertical timeline of 6 placeholder rows.
- Within 200ms (Phase 3+), the SSE stream connects and the orchestrator begins emitting events.
- Each placeholder row fills in **as the agent's output becomes available**, not all at once.
- The visitor watches structured outputs — bullet points, severity badges, dollar amounts — appear progressively. NOT raw model text streaming character-by-character.

### Tier 1 success = the visitor gets to the synthesis summary

After ~60 seconds, a final card appears at the top of the timeline: a 4-sentence executive summary citing each agent. The visitor has seen the system do the work. We've earned our 5 minutes.

---

## Tier 2: Probing the output

The deal detail view is a **scrollable, layered surface**. Every element produced by an agent is interactive.

### Layout (scrollable, top-to-bottom)

1. **Deal header** — sticky on scroll. Customer name, deal type, ACV, term, stage badge, and a "Reset & re-run" button.
2. **Synthesis summary card** — the orchestrator's 4-sentence final review. Highlighted, slightly larger text.
3. **Recommended action banner** — single line, color-coded: "Approve as proposed" (green) | "Counter-propose" (yellow) | "Escalate" (red).
4. **Slack post embed** — an iframe or screenshot+link showing the live post in the demo workspace, with a "Join the demo Slack" button next to it.
5. **The reasoning timeline** — vertical timeline of the 6 steps the orchestrator ran. Each step is collapsible; expanded by default for the first 3, collapsed for the rest.
6. **Generated artifacts panel** — 5 download buttons: redlined MSA (.docx), populated order form (.pdf), AE email draft, approval review one-pager (.pdf), and **financial model workbook (.xlsx)** — the workbook is the artifact that addresses the JD's Excel/Sheets/financial modeling/ASC 606 requirements; see `docs/10-sheets-integration.md`.
7. **Customer signals panel** — Exa results: recent funding, headcount changes, leadership moves, public news in last 90 days. Each result is a card with the source domain visible.
8. **Similar past deals panel** — top-3 similar deals from the vector search. Each card shows the customer name, the deal headline, the outcome (won/lost/closed), and a one-line note ("we accepted similar MFN with carve-out for Anthropic 2025 Q3").
9. **Pricing modeler (Tier 2 deep dive)** — interactive sliders for discount %, ramp length, payment terms; live margin and ASC 606 impact updates. (See `docs/07-extra-features.md` for full spec.)
10. **Audit log** — every individual agent decision in chronological order, expandable, with input/output JSON inspectable. (See extra features.)
11. **Footer** — the disclaimer, the GitHub link, and a "Submit your own deal" CTA.

### Interaction details

- **Every agent output card has a "How did the agent decide this?" expandable section** that reveals the full reasoning_summary text from the audit log.
- **Clicking a flagged guardrail in the Pricing output** opens a modal showing: the rule, the actual value, the threshold, the explanation, and a link to the guardrail editor.
- **Clicking a flagged clause in the Redline output** opens a modal with the customer's proposed language, the agent's suggested counter, and the fallback position.
- **Clicking a similar deal** navigates to that deal's full review (the demo deepens).
- **Hovering on a customer signal** shows a tooltip with the source URL and date.

### Mobile considerations

- Sticky deal header collapses to just the customer name + "Reset" button on scroll.
- Reasoning timeline cards are full-width with no left/right padding on mobile.
- Pricing modeler sliders use larger touch targets (minimum 44px tall).
- Slack embed becomes a screenshot with "Open in Slack" button on mobile.
- Generated artifacts panel becomes a 2-col grid on mobile (3 rows for 5 buttons), 5-col row on desktop.

---

## Tier 3: Submit your own deal

### Entry point

A prominent "Try your own deal" button on `/pipeline` (top-right, gold accent). Also linked from the footer of every deal detail page.

### Form design

The form is **structured, not freeform.** Fields:

1. **Customer name** (text input) — placeholder: "Acme Corp"
2. **Customer domain** (text input) — placeholder: "acme.com" — used for Exa lookup
3. **Customer segment** (radio) — Enterprise | Mid-market | PLG/Self-serve
4. **Deal type** (radio) — New logo | Expansion | Renewal | Partnership
5. **ACV** (number input with $ prefix) — placeholder: "$240,000"
6. **Term length** (number with "months" suffix) — placeholder: "24"
7. **Pricing model** (radio) — Subscription | Usage-based | Hybrid | One-time
8. **Discount %** (slider, 0–60%) — defaults to 0%
9. **Discount reason** (text area, optional) — placeholder: "Competitive displacement of Apollo + Outreach"
10. **Non-standard clauses** (multi-select chips) — MFN, rollover credits, exclusivity, custom payment terms, free implementation, expansion pricing lock, professional services bundling, custom data residency, out clause
11. **Customer request** (text area) — placeholder: "Free-text — describe what the customer is asking for in their own words. The more specific, the better the analysis."
12. **Competitive context** (text area, optional) — placeholder: "Three other vendors in the bake-off. Decision in 10 days."

### What happens on submit

- POST to `/api/submit-deal` with the form payload.
- Server creates an in-memory deal record (NOT persisted to SQLite).
- Server generates an embedding for the deal and runs vector search against the seeded set.
- Server hands the deal off to the orchestrator.
- Browser redirects to `/deals/visitor-<session_id>` and connects to the SSE stream.
- Same Tier 2 experience plays out — but on the visitor's own deal.
- Slack post fires to the demo workspace tagged `[VISITOR SUBMISSION]`.

### Why structured form, not chat

A free-text "describe your deal" input forces the visitor to know what the system can handle. They don't. A structured form with sensible labels **teaches them what kinds of deals the system reviews** while they fill it out. It also prevents the failure mode where a visitor types "make me a sandwich" and the system has nothing to do.

The one freeform field is `customer_request`. That's where the agent reasoning has the most surface area.

---

## Design system

### Visual language

Aesthetic target: **Clay's actual product UI**.

The reference is the live Clay app: a left sidebar with the workspace identity at the top, a persistent top-right user-identity slot, white content surfaces with very subtle borders (no shadows / no glass), Clay-style table views with row numbers and small lucide-style type icons in column headers, friendly-but-restrained geometric icons on dashboard cards, and the brand blue (#3B82F6) used sparingly on filled CTAs, links, and "active" highlights. Body density is tight (Clay tables sit comfortably at ~36–40px row heights, ~13px text) — much denser than a Linear/Stripe-style marketing surface.

We do **not** mimic Clay's actual logo, illustrations, or color gradient. Our wordmark is text-only ("Kiln · where clay gets fired into final form"); our dashboard icons are simple geometric primitives in their own palette.

- **Density.** Body baseline 13.5px / 1.45 line-height. Section spacing ~16–24px (down ~25% from a marketing-style rhythm). Table rows ~36–40px tall.
- **Palette.**
  - Background (content surfaces): `#FFFFFF` (pure white)
  - Background (sidebar / secondary surfaces): `#FAFAFA`
  - Background (hover state): `#F5F5F5`
  - Foreground: `#0A0A0A` (near-black)
  - Accent / brand: `#3B82F6` (Clay blue — sampled from the reference UI). Used for filled primary CTAs, links, the "Start here" pulsing dot, the closed-won ✓ Won badge, active sidebar highlights.
  - Muted text: `#737373`
  - Border: `#E5E5E5` (very subtle, used everywhere a divider is needed)
  - Success: `#15803D` (green-700) — kept for non-deal contexts; closed-won uses brand-blue
  - Warning: `#A16207` (amber-700)
  - Danger: `#B91C1C` (red-700)
- **Typography**:
  - **Inter** for everything (UI, body, headings). Weight 600 for headings, 500 for medium emphasis, 400 for body.
  - **JetBrains Mono only for numbers** (ACV, TCV, term, row numbers, audit-log timestamps). Tabular figures everywhere — numbers should never reflow.
- **Borders**: 1px, `#E5E5E5`. No drop shadows, no glows, no glassmorphism on content surfaces. The slide-over panel is the one place we allow `shadow-2xl` because it sits over the dimmed scrim and needs to read as floating.
- **Radii**: 6px on cards and inputs, 4px on toolbar/ghost buttons, 9999px on pills/badges.

### Buttons

- **Primary**: filled `#3B82F6` background, white text. Used for the "Run review" CTA and submit-deal flows. Not for navigation.
- **Ghost / toolbar**: no background, muted text, subtle border + bg-surface-hover on hover. Used for Filter/Sort/View toolbar items.
- **Icon buttons** (X, hamburger): square 28–36px target, no border at rest, bg-surface-hover on hover.

### Layout primitives

These are the four chrome elements that define every surface. They were locked in during the Phase 2 visual restyle.

| Primitive | Where | Purpose |
|---|---|---|
| **Persistent left sidebar** (`components/sidebar.tsx`) | Mounted by `components/app-shell.tsx` on every route | Brand wordmark + main nav (Home, Pipeline, GitHub). ~200px wide on desktop; collapses behind a hamburger toggle on mobile and slides in as a backdrop-dimmed drawer. Active item = `bg-surface-hover`, no border accent. |
| **Workspace badge** (`components/workspace-badge.tsx`) | Top-right of the persistent top bar | Ambient identity slot — "Demo Mode · Kiln Workspace" with a small pulsing brand-blue dot. Non-interactive. |
| **Dashboard at `/`** (`app/page.tsx`) | Root URL | Welcome heading + warm sub-copy in Clay's "What will you build today?" register, a row of entry cards with colored geometric icons, then a sparse "Workspaces & views" table list. Cards link only to pages that already exist; new surfaces add cards in later phases. Dashboard links to `/deals/*` use **hard navigation** (`<a href>`) so they open the full deal page, not the slide-over. |
| **Slide-over for deal detail** (`app/@modal/(.)deals/[id]/page.tsx` + `components/slide-over-shell.tsx`) | Triggered by client-side navigation to `/deals/<id>` from `/pipeline` | Right-side panel covering ~90% of the viewport width on desktop with a 10% dimmed scrim on the left; full-screen on mobile (no scrim). Closes on X / ESC / scrim-click / browser back. URL updates to `/deals/<id>` for deep-linking. Direct URL access (or any `<a href>` hard nav) renders the full standalone page instead — the same `<DealDetail>` component is shared between both surfaces. |

### Components (shadcn/ui base, customized)

Use these shadcn components, lightly themed to match the palette:
- `Card`, `CardHeader`, `CardContent`
- `Button` (primary, secondary, ghost variants)
- `Badge` (with severity variants: info, warn, danger, success)
- `Tabs` (for switching between agent outputs)
- `Slider` (for the pricing modeler)
- `Input`, `Textarea`, `Select`
- `Dialog` (for the "see reasoning" modals)
- `Tooltip`
- `Table` (for the pipeline view)

### Custom components to build

| Component | Purpose | Status |
|---|---|---|
| `<Sidebar>` | Persistent left rail with brand + nav + active highlight | ✅ Phase 2 |
| `<WorkspaceBadge>` | Top-right ambient identity slot | ✅ Phase 2 |
| `<AppShell>` | Composes sidebar + top bar + main slot | ✅ Phase 2 |
| `<EntryCard>` + `<GeometricIcon>` | Dashboard entry-point cards with colored geometric icons | ✅ Phase 2 |
| `<SurfacesTable>` | Sparse Clay-style "available surfaces" table on the dashboard | ✅ Phase 2 |
| `<PipelineToolbar>` | Default View · N Deals · N Columns · Filter · Sort | ✅ Phase 2 |
| `<PipelineSection>` | Clay-style table grid with row-number gutter and type-iconed headers | ✅ Phase 2 |
| `<StartHereTag>` | Brand-blue pulsing-dot pill on the recommended hero row | ✅ Phase 2 |
| `<StageBadge>` / `<DifficultyBadge>` | Severity-colored pills incl. ✓ Won variant for closed-won | ✅ Phase 2 |
| `<DealHeader>` / `<DealMetadata>` / `<DealDetail>` | Sticky deal header + 3-card metadata grid + customer-request panel | ✅ Phase 2 |
| `<TimelinePlaceholder>` | Empty 6-step orchestrator timeline skeleton | ✅ Phase 2 |
| `<SlideOverShell>` | Right-side slide-over with X / ESC / scrim / back-button close | ✅ Phase 2 |
| `<ReasoningStream>` | The vertical timeline that updates as SSE events arrive | Phase 3 |
| `<AgentOutputCard>` | Wrapper for each sub-agent's structured output, with collapsible reasoning | Phase 3 |
| `<GuardrailBadge>` | Severity-colored pill showing pricing guardrail status | Phase 3 |
| `<SimilarDealCard>` | Inline card for vector-search results | Phase 5 |
| `<CustomerSignalsPanel>` | Exa results presented as a feed | Phase 5 |
| `<PricingModeler>` | Interactive sliders for what-if analysis | Phase 8 |
| `<ApprovalMatrixEditor>` | The Tier 2 power-user feature | Phase 8 |
| `<CPQComparisonPanel>` | The "what would Salesforce CPQ have done" view | Phase 8 |
| `<AuditLogView>` | Chronological agent decisions, JSON-inspectable | Phase 8 |
| `<SlackEmbed>` | The live demo Slack post embed | Phase 6 |
| `<ArtifactsPanel>` | The 5 download buttons grid (MSA, order form, email, one-pager, .xlsx workbook) | Phase 7 |
| `<OpenInSheetsButton>` | Phase 8 only — triggers Google Sheets API copy + populate, opens result in new tab | Phase 8 |

### Streaming UX details

When SSE events arrive:
- A new card slides in from below with a 200ms ease-out
- The card's status indicator pulses (the "Pricing Agent" header has a small dot animating)
- As structured fields populate within the card, they fade in one at a time at 80ms intervals
- When the agent completes, the pulsing stops and a small green check appears

This pacing is critical. Too fast and it feels chaotic. Too slow and the visitor loses interest. Aim for ~10–15s per agent step in the visible UI even if the agent finishes faster.

### Loading states

- **Never show a generic spinner.** Loading states are skeletons of the structure that's about to populate.
- **Skeleton placeholders** match the shape of the final content (e.g., a placeholder card for the Pricing output has the same dimensions as a real Pricing output).
- **Streaming partial outputs** is the ideal state — show fields as they populate, not "Loading..." until everything is done.

### Error states

- **Friendly, specific.** "The pricing agent timed out — retry just this step?" not "Error 500."
- **Single retry button** for individual sub-agent failures, doesn't re-run the whole pipeline.
- **Hard errors** (e.g., Anthropic API down) show a banner across the top of the page and disable the "Run review" buttons. Don't pretend the system works when it doesn't.

### Empty states

- **Pipeline view**: never empty (always has the 5 scenarios + 8 closed deals seeded)
- **Submit-your-own-deal form**: the form itself is the "empty state"
- **Audit log on a deal that hasn't been reviewed**: shows "Click 'Run review' to begin" with a primary CTA button

---

## Accessibility

- All interactive elements keyboard-navigable
- Color is never the only signal of severity (use icon + text + color)
- Min contrast ratio 4.5:1 for body text
- All form inputs have associated labels
- All modal/dialog components trap focus correctly
- The reasoning stream is announced to screen readers at each new step (using `aria-live="polite"`)

---

## Don't-do list

- ❌ AI/futurism gradients (purple-to-cyan, neon glows, "matrix" effects)
- ❌ Glassmorphism / frosted glass anywhere
- ❌ Animated background blobs or orbs
- ❌ Marketing-style hero sections with giant headlines
- ❌ "Powered by AI" badges or branding
- ❌ Dark mode for v1 (light mode only — half the audience views in bright daylight on phone)
- ❌ Mimicking Clay's actual logo, illustrations, color gradient, or copy. The wordmark is text-only ("Kiln · where clay gets fired into final form"); dashboard icons are our own geometric primitives. We're matching the *layout register* of Clay's product UI, not impersonating the brand.
- ❌ Carousel/slider components anywhere
- ❌ Modal popups that aren't user-initiated
- ❌ Cookie banners (no cookies needed)
- ❌ Newsletter signup, email capture, or any form not directly related to deal submission
