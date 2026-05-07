# 13 — Clay Integration Plan v1

> Phase 1 deliverable for the `clay-integration` branch. Discovery only — implementation does not start until the plan is explicitly approved.
>
> **Note on §1**: The discovery findings here are sourced from Clay's public-facing pages (clay.com/mcp, university.clay.com, community.clay.com, salesforge.ai review). Clay does not publish full MCP technical specs (server URL, transport, full tool list with schemas, rate limits) outside the in-product workspace. Some of this section is intentionally hedged — the unhedged ground truth lands when the user runs `scripts/clay-mcp-discover.ts` against their freshly-connected workspace. Sections §2–§10 are written so that decisions hold across the most likely outcomes of that discovery run.

---

## 1. Discovery findings

### 1.1 Two products called "Clay" — disambiguating

Public web search aggressively conflates two unrelated products:

- **clay.com** — the **GTM enrichment platform** the brief is about. Sales enrichment, ICP scoring, prospecting waterfalls, "Clay Functions." This is the platform the screenshot showed.
- **clay.earth** (a.k.a. clay-inc/clay-mcp) — an unrelated **personal-relationship CRM** (contacts, interactions, notes). MCP at `https://mcp.clay.earth/mcp`. Several public listings (Smithery, MCP Directory, PulseMCP) list this as "the Clay MCP server" — they are wrong for our purposes.

This plan is exclusively about **clay.com**. Ignore any clay.earth references.

### 1.2 Transport, auth, supported clients

Sourced from clay.com/mcp + university.clay.com + clay.com/blog/clay-mcp:

| Aspect | What's documented |
|---|---|
| Connection URL | **Per-workspace, generated on-click**. The user must click "Connect" on `app.clay.com/settings/mcp` to mint the workspace endpoint. URL not advertised publicly. |
| Transport | **Not documented publicly.** Inferred to be MCP-spec streamable HTTP based on Clay's public client list (Claude Desktop, ChatGPT, Cursor — all streamable-HTTP MCP clients). SSE fallback may also be supported per the spec. |
| Authentication | **OAuth 2.1 / Protected Resource Metadata** is the spec-compliant flow Clay implements with its tier-1 clients (per generic discussion in MCP-spec docs). Whether Clay also issues a long-lived bearer token after Connect is **unknown until discovery**. |
| Supported clients | Officially: ChatGPT, Claude (Desktop, web, mobile). Mentioned: Cursor, Poke, Raycast. Generic Node MCP clients: **not officially documented**. |
| Free-tier credits | 500 bonus credits to test. (`+ 2000 trial credits` for direct Clay platform — separate from MCP usage.) |
| Per-call credit cost | "20–100 credits per MCP invocation" depending on enrichment depth. |
| Rate limits | Not publicly documented. Configurable per-rep budgets exist in workspace admin. |

### 1.3 Tools exposed — ground truth pending

The brief screenshot listed 3 of 7 tools:
- `find-and-enrich-contacts-at-company`
- `find-and-enrich-list-of-contacts`
- `find-and-enrich-company`

**The other 4 tool names are not publicly documented.** Public capability descriptions (clay.com/mcp + university.clay.com) suggest the seven likely include:

- One or more **People Search** variants (filter by job title, location, company)
- **Account research** (deeper than `find-and-enrich-company` — fans out across LinkedIn + site + news)
- **Custom Function execution** (run a workspace-defined enrichment waterfall by name)
- **Audience reasoning / query** (read from saved Clay Audiences)

The `community.clay.com` post titled "MCP Server with 21 Tools for Advanced GTM Engineering" surfaced earlier in discovery is a **third-party server** (`Mihailo2501/potter-mcp`), not Clay's own. Discount it.

**Action item for discovery run**: when the user runs `scripts/clay-mcp-discover.ts` post-Connect, paste the resulting tool list verbatim into this section to replace the inferred list above.

### 1.4 The HTTP API "fallback" is not enrichment data

The brief mentioned an HTTP-API fallback (Path B). Discovery confirms this is **a much weaker fallback than expected**:

- `university.clay.com/docs/http-api-integration-overview` describes Clay's HTTP API as a **generic passthrough** — "call any API, even if Clay does not offer a native integration."
- It is *not* a set of native company/contact enrichment endpoints.
- Without MCP, Clay's enrichment data is reachable only by running a Clay Function inside the Clay UI and pulling results out of a saved table — a flow that's at minimum awkward to wire as an automated demo back-end.

**Implication**: if MCP turns out to be Claude-Desktop/ChatGPT-only, we don't have a clean fallback. §7 lists the contingency.

### 1.5 What's already in our tree

`@modelcontextprotocol/sdk` is **already a transitive dep** of `@anthropic-ai/claude-agent-sdk` (^1.29.0). Both `Client` and the `StreamableHTTPClientTransport` / `SSEClientTransport` constructors are importable. **Zero new dependencies needed.** Verified by:

```bash
node -e "console.log(Object.keys(require('@modelcontextprotocol/sdk/client/index.js')))"
# → [ 'Client', 'getSupportedElicitationModes' ]
```

---

## 2. Architectural shape — recommendation

The brief offered three shapes:

| Shape | Description | Fit |
|---|---|---|
| **(a) Pre-orchestrator enrichment** | Fetch Clay data once before dispatching agents. All five sub-agents see the same enrichment via the user message. | **Recommended.** |
| (b) Per-agent enrichment | Each agent that needs Clay data calls it directly. | Wasted credits, harder to cache, harder to narrate in the timeline. |
| (c) Tool-call layer | Expose Clay tools as MCP tools to each sub-agent; agents decide whether to call. | Most agentic but most expensive. Sub-agents are deliberately leaf-node here per `lib/agents/_shared.ts` — adding tool decisions reopens a design we closed in Phase 3. |

**(a) Pre-orchestrator enrichment** is correct because:

1. **Cacheable as a first-class field on the v5 cache**, exactly like `customer_signals` is today. One Clay call per deal review, durably cached.
2. **Single visible "Clay enrichment" substep** in the orchestrator timeline — the visitor sees Clay running once, not five times.
3. **Cost-bounded**: 1 Clay call per scenario × 5 hero scenarios = ≤500 credits to seed the entire demo. Comfortably inside the 500-credit free tier with room for 1–2 fresh runs during plan validation.
4. **Mirrors the existing Exa pattern** in `lib/tools/exa-search.ts` + `lib/mcp-servers/exa-server.ts` — the integration delta is one new helper file plus an additional parallel `Promise.all` arm in the orchestrator.

**(b) and (c) sacrifice**: clean caching (each agent's call would cache separately or bust the cache when one changed), narrative legibility (multiple Clay substeps scattered through Mode 1), and credit predictability.

---

## 3. Where Clay slots into the orchestrator

Today's orchestrator (`lib/agents/orchestrator.ts:188–263`):

```
Step 1   Fetch deal + customer (sync, ~150 ms)
Step 2   Parallel fan-out:
           • Exa customer_signals
           • sqlite-vec similar_deals
Step 3   Parallel review fan-out:
           • Pricing | ASC 606 | Redline
Step 4   Approval (sequential, depends on 3)
Step 5   Comms (sequential, depends on 1–4)
Step 6   Synthesis (Opus 4.7)
```

Clay enrichment goes **inside Step 2 as a third parallel arm**, not a new Step 1.5:

```
Step 2   Parallel fan-out:
           • Exa customer_signals
           • sqlite-vec similar_deals
           • Clay enrichment        ← NEW
```

Why a third arm of Step 2 (and not Step 1.5):

- All three are independent reads against the customer record. None of them depends on the other two's output.
- `Promise.all([...])` already runs the existing two; adding a third is one line.
- Total Step-2 wall time becomes `max(exa_latency, vector_latency, clay_latency)`. Clay's expected 2–5 s sits squarely inside Exa's range, so the visible Mode 1 timeline duration changes by at most ~1–2 s.
- The single Clay substep ("Querying Clay for company enrichment") slots cleanly next to the existing two Step-2 substeps. The reserved `clay_enrichment` substep slot in `components/reasoning-stream.tsx:127` is currently between `fetch_deal` and `step2_fanout` — it moves into the Step 2 group on implementation.

The reservation slot in `ORCHESTRATOR_SUBSTEPS` (`reasoning-stream.tsx:127`) needs to be **moved** into the Step 2 substep cluster (`step2_signals` / `step2_similar` siblings) and **un-disabled**. The Phase-8 badge becomes a `live`/`cached` badge mirroring the artifacts panel pattern.

---

## 4. What flows to which sub-agent prompt

Clay's likely-exposed enrichment fields (per the marketing copy in §1.2 — to be confirmed by discovery): company size, funding rounds + dates, ARR estimate, tech stack, headcount growth %, open jobs count, leadership changes, intent signals, custom data points.

| Agent | Receives | Why it improves the output |
|---|---|---|
| **Pricing** | funding stage, ARR estimate, headcount growth, tech stack (does the customer already use a competing tool?), revenue band | Discount-justification quality. Pricing already reasons about willingness-to-pay; Clay tells it whether the customer just raised a Series C ($$ available) or laid off 20% (price-sensitive). |
| **Redline** | company size, jurisdiction, public-vs-private status, GTM hiring velocity | Clause severity. A Series A startup with 40 employees gets a different MFN counter than a public company with $2B ARR. GTM hiring velocity reads as urgency → leverage. |
| **Approval** | revenue band, public-vs-private (SOX implications), ARR estimate (cycle-time band) | Routing precision. Approval's existing matrix uses ACV; adding revenue band + public status moves "expected_cycle_time" estimates from generic to grounded. |
| **Comms** | leadership change names, recent funding news, open jobs count | AE email quality. "Congrats on the Series C" + correct exec name + reference to active hiring make the customer email non-generic. |
| **ASC 606** | (none — pass-through) | Recognition timing isn't enrichable from external data. Skipping keeps the prompt clean. |

**Prompt delta is small**: every agent prompt today receives a structured deal payload. Clay enrichment is added as one new top-level block in the user message — `<clay_enrichment>...</clay_enrichment>` — that the prompt instructs the agent to consider when justifying. **No tools-loop changes**, no new `mcpServers` registration on the leaf agents.

For ASC 606 specifically, the orchestrator simply doesn't include the block in the user message — the prompt stays identical to today.

---

## 5. UI slot fills

The redesign reserved exactly four Clay slots (per `docs/12-redesign-plan.md §4`). Each is structurally ready:

### 5.1 Customer-signals card → Clay tab (deal detail right rail)

| Today | After |
|---|---|
| Two tabs: **Exa** (active), **Clay** (locked phase-8 placeholder, dashed border). | Same two tabs. **Clay** tab now renders structured fields from `clay_enrichment`. |

Render shape proposed (sectioned mini-card layout, mirrors Exa's signal rows):

```
─── Clay tab ──────────────────────────────────────
COMPANY
  Headcount   1,500   (+12% YoY)
  Funding     Series C · $90M · Aug 2025
  Tech stack  Salesforce, Snowflake, Looker, Anthropic API
  Open roles  18 (5 GTM, 8 eng, …)

LEADERSHIP
  Sarah Liu   joined as Chief Revenue Officer · Mar 2026
  Tom Chen    departed as VP Sales · Jan 2026

INTENT SIGNALS
  Increased "AI infrastructure" job postings (12 → 38, last 60d)
  Site traffic +27% MoM
─── ─────────────────────────────────────────────── ── live · 4.2s
```

- **Empty state** (deal has no Clay enrichment): keeps the existing "MCP integration" lock card. The pickVariant guard in the deal-data flow controls this.
- **Loading state** (during Mode 1 streaming, before Clay returns): a 3-row skeleton matching the row shape. Same pattern as the Exa skeleton already in `customer-signals-panel.tsx`.
- **Error state** (Clay returned 4xx/5xx, or rate-limited): "Clay enrichment unavailable for this deal — falling back to Exa-only signals." Muted amber tone. The deal still completes review.

### 5.2 Orchestrator timeline → Clay enrichment substep

| Today | After |
|---|---|
| `clay_enrichment` substep at position 2 in `ORCHESTRATOR_SUBSTEPS`, marked `disabled: true`. Renders italic + "Phase 8" badge. | Substep moves into the Step 2 cluster. `disabled: true` removed. Receives live `running` / `complete` events. |

Substep emitter pattern is identical to `step2_signals` and `step2_similar` (shown in `orchestrator.ts:212–256`).

### 5.3 Demo-data banner → Variant D

| Today | After |
|---|---|
| Variant union includes `"D"` but `pickVariant()` never returns it. | `pickVariant()` returns `"D"` when `args.hasClayEnrichment === true`. |

Guard: `hasClayEnrichment` is added to `pickVariant`'s input args, derived from the cache file's presence of `clay_enrichment`. Existing copy in `bannerCopy("D", ...)` is unchanged.

### 5.4 Dashboard KPI rail → Tile 5

| Today | After |
|---|---|
| Static lock placeholder ("Clay enrichment · Phase 8 · MCP integration"). | `N / 12` count of deals that have a `clay_enrichment` field populated in their cache + last enrichment timestamp. |

Numerator / denominator definition (concrete):
- **Numerator**: count of deals where `getClayEnrichment(dealId) !== null` (helper reads `db/seed/cached_outputs/<dealId>-review.json` for v5 cache + checks `clay_enrichment` field).
- **Denominator**: total deals from `listDeals()`. Same as the rest of the rail.
- **Sub-line**: `N / total · last enriched <relative-time>` mirroring the existing rail copy.

The `getCachedRiskSummary()` helper at `lib/dashboard/cached-summary.ts:63` is the right place to add a 6th aggregate (`clayEnrichedCount`, `lastClayEnrichmentAt`). The rail's `<KpiRail>` component receives one new prop.

---

## 6. Cache schema bump v4 → v5

Current shape (`lib/agents/orchestrator.ts:114–124`):

```ts
interface OrchestratorCacheFile {
  version: 4;
  deal_id: string;
  outputs: OrchestratorOutputs;
  synthesis: string;
  similar_deals: SimilarDealRecord[];
  customer_signals: CustomerSignalsResult;
  slack_post_result: SlackPostRecord;
  timings: SubstepTimingEntry[];
  metadata: OrchestratorMetadata;
}
```

After:

```ts
interface OrchestratorCacheFile {
  version: 5;
  deal_id: string;
  outputs: OrchestratorOutputs;
  synthesis: string;
  similar_deals: SimilarDealRecord[];
  customer_signals: CustomerSignalsResult;
  clay_enrichment: ClayEnrichmentResult | null;   // ← NEW
  slack_post_result: SlackPostRecord;
  timings: SubstepTimingEntry[];
  metadata: OrchestratorMetadata;
}

interface ClayEnrichmentResult {
  // Source distinguishes a real MCP call from a hand-authored mock —
  // mirrors the existing `simulated_signals` pattern for fictional
  // customers in CustomerSignalsResult.
  source: "live" | "simulated" | "unavailable";
  // Records when this snapshot was captured. Render as relative-time
  // in the UI.
  fetched_at: string;
  // Tool returns vary by which Clay tool was used; the helper
  // shape-converts everything to this normalized form so Mode-2 UI
  // doesn't fork on tool variant.
  company: ClayCompanyEnrichment;
  // Up to 8 leadership change events; ordered most-recent first.
  leadership_changes: ClayLeadershipChange[];
  // Up to 5 intent signals (each is a one-line headline + optional
  // metric). Mirrors Exa's signal shape on purpose.
  intent_signals: ClayIntentSignal[];
  // Free-text note when Clay returned partial data ("no funding
  // information for this domain") — surfaced in the UI sub-line.
  note: string | null;
}

interface ClayCompanyEnrichment {
  headcount: number | null;
  headcount_growth_yoy_pct: number | null;
  funding_stage: string | null;
  last_round_amount_usd: number | null;
  last_round_date: string | null;
  arr_estimate_usd: number | null;
  tech_stack: string[];
  open_roles_total: number | null;
  open_roles_gtm: number | null;
  is_public: boolean | null;
  jurisdiction: string | null;
}

interface ClayLeadershipChange {
  person_name: string;
  role: string;
  change_type: "joined" | "departed" | "promoted";
  occurred_at: string | null;
}

interface ClayIntentSignal {
  headline: string;
  metric: string | null;
  source: string | null;
}
```

The version bump from 4 → 5 invalidates v4 caches automatically per the existing pattern at `orchestrator.ts:152–175`. Cached scenario outputs need to be regenerated **once** with Clay enabled (see migration step 7 in §8).

---

## 7. Risks and mitigations

### R1 — Clay's MCP doesn't accept non-Anthropic-Connector clients (HIGH)

**Risk**: discovery-script connect fails or Clay returns 401/403 with no obvious bearer-token shape because Clay's MCP is gated to Claude Desktop / ChatGPT / Cursor through OAuth flows that assume a browser dance + redirect URI.

**Likelihood**: medium-high. Public docs only ever show the Connect button inside those three products. No CLI / SDK examples documented.

**Mitigation, in order of preference**:
1. **Discover & adapt**: the discovery script already supports either `streamable-http` (default) or `sse` transports. If a static bearer is rejected but the URL accepts an OAuth access token, the user may be able to grab one from the browser's network tab post-Connect. Run discovery, report results, adjust.
2. **Pre-cache with a one-time human-in-the-loop run**: run the 5 hero deals through Claude Desktop or ChatGPT manually, copy the structured results, store as hand-authored fixtures in `db/seed/clay_fixtures/<dealId>.json`. The orchestrator reads these fixtures via the same `clay_enrichment` cache field. Live calls are skipped entirely — this becomes a deterministic-replay-only integration. Acceptable for the demo since cache replay is already the default path.
3. **Hard cutover to fixtures-only**: if MCP connection turns out to be operationally infeasible for our pattern, document it honestly in the demo as "Clay enrichment shape, sourced from snapshot fixtures hand-collected via Claude Desktop." This is **the value-story compromise the user authorized in the brief** ("If Clay's MCP says something the value story can't accommodate, surface that honestly"). The 4 UI slots still light up with structured data; the orchestrator timeline shows a "Clay enrichment (fixture)" substep instead of "(live)."

### R2 — Credit budget too small for live demo traffic (MEDIUM)

**Risk**: 500 free-tier credits at 20–100 credits per call ≈ 5–25 invocations total. Each live "Re-run live" demo button click consumes 1 call.

**Mitigation**:
- Default demo path is cache replay → 0 Clay calls.
- The `?live=1` dev path remains gated behind the dev-tools URL flag (already true today for re-runs).
- Pre-cache 5 hero scenarios on the maintainer's machine before deploy (one-time ~5 calls × ~50 credits = 250 credits — half the free tier).
- Visitor "Submit your own deal" Phase 7 path skips Clay entirely (Variant C does not flip to D). Documented in §9 open question 3.

### R3 — Latency (LOW)

**Risk**: a slow Clay call extends the visible Mode 1 timeline and breaks pacing.

**Likelihood**: low-medium. Clay's tools fan out across LinkedIn + site + news in a single call — that's ~2–5 s for the documented research tools.

**Mitigation**: Step 2 fan-out is parallel; the visible duration is `max(arms)`. Worst case +2 s on the existing ~5 s Step-2 wall time. If a particular deal sees Clay >15 s, the cache-replay tape paces it normally on subsequent demos. The orchestrator already enforces a per-arm timeout pattern via the surrounding Promise.all — adding a hard 30 s timeout to the Clay arm and gracefully degrading to `clay_enrichment: { source: "unavailable", ... }` is an explicit step in the migration plan (§8 step 4).

### R4 — Streaming substep granularity (LOW)

**Risk**: if Clay's MCP doesn't emit progress events, the timeline shows only "running" → "complete" with a long pause. Less satisfying than Exa's two-phase signal.

**Mitigation**: emit a synthetic 3-event narrative — "Querying Clay" → "Resolving company" → "Pulling enrichment fields" — paced over the actual call duration. Same pattern Pricing's `feedDelta` watcher uses to synthesize substeps. Already supported by the existing `executeAgentQuery` helper in `_shared.ts` (it accepts a `feedDelta` callback and we have the wall-clock duration to interpolate).

---

## 8. Migration plan

Ordered commits. Each row is one logical commit per the redesign-v2 cadence.

| # | Step | Files | Effort | Risk |
|---|---|---|---:|---:|
| 1 | **Run discovery** — user clicks Connect, populates `CLAY_MCP_URL` + `CLAY_MCP_TOKEN`, runs `npx tsx scripts/clay-mcp-discover.ts`, pastes verbatim output into §1.3. Plan revisions land if discovery surprises us. | docs/13 (§1.3 only) | XS | Low |
| 2 | **Schemas** — write `lib/agents/clay-schemas.ts` with the four interfaces from §6 as Zod schemas (`ClayEnrichmentResultSchema`, `ClayCompanyEnrichmentSchema`, …). | new file | S | Low |
| 3 | **Tool helper** — write `lib/tools/clay-enrich.ts` exporting `fetchClayEnrichment(args)` mirroring `fetchCustomerSignals` shape. Internally constructs the `Client` + transport, calls one Clay tool (whichever discovery picks as the company-enrichment one), shape-converts to `ClayEnrichmentResult`. Wraps in 30-s timeout + try/catch — never throws, returns `{ source: "unavailable", ... }` on failure. | new file | M | Med (R1) |
| 4 | **Orchestrator wire-up** — `orchestrator.ts:223–252` Step 2 fan-out grows a third arm. New substep ID `step2_clay`, identical pattern to `step2_signals`. Cache version 4 → 5. New `clay_enrichment` field on `OrchestratorCacheFile`. Reasoning-stream substep slot moved + un-disabled. | orchestrator.ts, reasoning-stream.tsx | M | Med |
| 5 | **Agent prompt deltas** — append `<clay_enrichment>` block to the user-message constructors in Pricing, Redline, Approval, Comms (not ASC 606). Single-line edit per agent — they already build user messages from a structured payload. Prompts (lib/prompts/*.md) gain one short paragraph each instructing the agent to consider Clay-enrichment when justifying. | 4 agent files, 4 prompt files | S | Low |
| 6 | **Cached fixtures for fictional customers** — hand-author Clay fixtures for Tessera Health, Northbeam, Reverberate (`db/seed/clay_fixtures/<dealId>.json`). The Clay helper checks for a fixture path before making a live call: fictional customer → fixture; real customer → live MCP. Mirrors the existing `simulated_signals` pattern in `customers` table. | 3 new fixture files, helper change | S | Low |
| 7 | **Pre-cache hero scenarios** — run `?live=1` once for each of the 5 heroes locally, write the v5 cache files. Commit the regenerated caches. ~250 credits. | 5 cache file regenerations | S | Med (R2) |
| 8 | **UI slot fills** — KPI tile 5 numbers, customer-signals Clay tab body, demo banner Variant D, orchestrator substep visual. Each is a localized component edit. | 4 component files + 1 dashboard helper | M | Low |
| 9 | **Pre/post Puppeteer comparison** — `scripts/capture-clay-before.ts` was effectively the redesign's after-state; new `scripts/capture-clay-after.ts` snaps the same surfaces with Clay live. Compare. | 1 new script | S | Low |
| 10 | **Documentation pass** — update `docs/03-agents.md §Orchestrator execution plan` with the third Step-2 arm. Update `docs/06-integrations.md` with Clay setup. | 2 doc files | XS | Low |

Approximate total: 6–8 commits, depending on whether step 1 surfaces a hard-stop (R1 unmitigatable). No commit lands without `npx tsc --noEmit` clean and `npm run build` clean.

---

## 9. Open questions for review

Defaults below ship unless overridden.

1. **Should ASC 606 receive Clay data?** Default: no (per §4) — financial recognition is not externally enrichable. Skipping keeps that prompt simpler.
2. **Should we cache Clay enrichment separately from the v5 cache, so we can refresh enrichment without re-running every agent?** Default: **yes**. Add `db/seed/clay_enrichments/<dealId>.json` as a sidecar. The v5 cache file references it (or inlines a snapshot) but the sidecar is the source of truth on a re-enrichment-only refresh. This makes "reset enrichment + replay" a real action without touching agent outputs.
3. **What does Variant C (visitor-submitted deals) do for Clay?** Default: **skip live Clay entirely**. Visitor submissions stay on the Exa-only path. Banner stays Variant C. Rationale: credits — every visitor click would consume 50–100 credits, easy to drain the free tier in a public demo. We surface this in the Variant C copy ("Clay enrichment runs only for the seeded hero scenarios").
4. **Does Clay's MCP support real-time progress events?** Default: **assume no, synthesize substeps**. If discovery shows yes, we wire real events; if no, we ship the 3-event interpolation pattern from §7 R4. Either way the visitor experience is the same.
5. **Should fictional customers (Tessera, Northbeam, Reverberate) get Clay data?** Default: **yes — hand-authored fixtures**. Same pattern as the existing `simulated_signals` for Exa. Honest demo banner copy preserved (Variant B + Variant D in combination would be misleading; in this case we keep Variant B and the Clay tab shows the simulated badge identical to the Exa simulated badge). 
6. **Should the demo-data banner Variant D copy be revised given §7 R1's potential cutover to fixtures-only?** Default: **revise the body to leave the source ambiguous** ("Clay enrichment · this deal pulls customer signals via Clay's MCP connector or hand-collected snapshots") only if R1 forces fixtures-only. If MCP works, ship the existing Variant D copy. Decision deferred until §8 step 1 completes.

---

## 10. Out of scope (do not touch)

- **Agent code internals**: leaf agents' streaming logic, schema-retry helper, MCP server registration. Clay enrichment goes in via prompt context, not via tool-loop changes.
- **Schemas for non-Clay agent outputs**: `lib/agents/schemas.ts` (PricingOutput/etc.) does not change.
- **Cache replay engine**: paced replay logic in `orchestrator.ts:152–175` stays. Cache version bump is the only delta to that path.
- **Exa, vector, Slack tools**: untouched. Clay is purely additive.
- **Document templates**: `lib/document-templates/*` — Clay enrichment may eventually appear in the AE one-pager, but that's a follow-up phase.
- **Slide-over routing pattern** + framer-motion transitions from the redesign — fully preserved.
- **Slack post format** — Clay context could improve the post body, but that's a follow-up.

If a real bug surfaces during Clay implementation it goes into `/tmp/clay-side-findings.md` for follow-up; we don't fix it on this branch.
