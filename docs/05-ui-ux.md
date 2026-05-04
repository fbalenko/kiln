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

### Landing page = `/pipeline`

There is **no marketing landing page**. The root URL `/` redirects to `/pipeline`. The visitor arrives at the working pipeline immediately.

### What they see (mobile-first)

Top of viewport:
- A sparse header: "Kiln" logo (left), "How it works" + "GitHub" links (right). No nav menu.
- A single sentence under the header: *"A multi-agent deal desk co-pilot, built for Clay's Deal Strategy & Ops team."*

Below the fold:
- A pipeline table styled like a Clay table — monospace numbers, two-tone palette, alternating row backgrounds at 1% opacity.
- 5 hero scenarios at the top, each with a colored difficulty badge, the customer name, the deal headline, and an "AI review" status indicator.
- One scenario has a subtle pulsing dot + "Start here" tag in the top-left corner.
- Below the 5 hero scenarios: "Past deals (closed)" — 8 historical deals shown in a slightly muted style, demonstrating "the system has institutional memory."

### What happens on click

- The visitor taps the highlighted scenario.
- Page navigates to `/deals/<id>`.
- The deal detail view loads with a static header (deal metadata) and an empty "Review" section showing a vertical timeline of 6 placeholder rows.
- Within 200ms, the SSE stream connects and the orchestrator begins emitting events.
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

Aesthetic target: **Linear / Stripe / Mercury**.

- **Whitespace-heavy.** Default vertical rhythm: 24px between sections, 16px between items.
- **Two-tone palette.**
  - Background: `#FAFAF9` (off-white, warm)
  - Foreground: `#0A0A0A` (near-black)
  - Accent: `#C2410C` (clay terracotta — on-brand-but-subtle)
  - Muted: `#737373` (neutral gray)
  - Success: `#15803D` (green-700)
  - Warning: `#A16207` (amber-700)
  - Danger: `#B91C1C` (red-700)
- **Typography**:
  - Headings: Inter, weight 600, tight letter-spacing
  - Body: Inter, weight 400
  - Numbers (anywhere): JetBrains Mono or Berkeley Mono — monospace tabular figures
- **Borders**: 1px, gray-200. No drop shadows, no glows, no glassmorphism.
- **Radii**: 6px on cards, 4px on buttons, 9999px on pills.

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

| Component | Purpose |
|---|---|
| `<ReasoningStream>` | The vertical timeline that updates as SSE events arrive |
| `<DealHeader>` | Sticky top bar with deal metadata + reset |
| `<AgentOutputCard>` | Wrapper for each sub-agent's structured output, with collapsible reasoning |
| `<GuardrailBadge>` | Severity-colored pill showing pricing guardrail status |
| `<SimilarDealCard>` | Inline card for vector-search results |
| `<CustomerSignalsPanel>` | Exa results presented as a feed |
| `<PricingModeler>` | Interactive sliders for what-if analysis |
| `<ApprovalMatrixEditor>` | The Tier 2 power-user feature |
| `<CPQComparisonPanel>` | The "what would Salesforce CPQ have done" view |
| `<AuditLogView>` | Chronological agent decisions, JSON-inspectable |
| `<SlackEmbed>` | The live demo Slack post embed |
| `<ArtifactsPanel>` | The 5 download buttons grid (MSA, order form, email, one-pager, .xlsx workbook) |
| `<OpenInSheetsButton>` | Phase 8 only — triggers Google Sheets API copy + populate, opens result in new tab |

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
- ❌ Carousel/slider components anywhere
- ❌ Modal popups that aren't user-initiated
- ❌ Cookie banners (no cookies needed)
- ❌ Newsletter signup, email capture, or any form not directly related to deal submission
