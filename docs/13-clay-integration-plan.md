# 13 — Clay Integration Plan

## Overview

This is the architecture decision record for integrating Clay into Kiln's orchestrator. It captures what was discovered while attempting to wire Clay's MCP server during the build, the architectural shape the integration would take, three fallback paths if direct MCP isn't viable yet, and the JD-aligned features it unlocks. It is intended for an engineer (or the author returning post-application) picking the work up where the build paused. The integration is **scoped but not shipped** — every other piece of the orchestration is in place; only the Clay arm is missing.

---

## Why integrate Clay

The orchestrator's Step 2 (`lib/agents/orchestrator.ts`) already runs a parallel `Promise.all` fan-out that gathers context before dispatching the five sub-agents. Today that fan-out has two arms: **Exa** (public customer signals) and **vector k-NN** over the seeded deal corpus (`db/seed/cached_outputs/` + sqlite-vec). Clay would be a **third parallel arm**, returning structured firmographic, intent, and contact data for the customer being reviewed. The fit is architecturally clean — the orchestrator doesn't need to be redesigned; one branch gets added to the existing fan-out.

The five sub-agents that consume context are not all equal beneficiaries. Each has a specific use for Clay data:

| Agent | What Clay enrichment changes |
|---|---|
| **Pricing** | Verified headcount + funding stage anchor ACV reasonableness; technographic signals inform competitive context |
| **Comms** | Enriched contact records identify actual decision-makers vs. ICs — AE briefing email and customer-facing email get correctly targeted |
| **Approval** | Intent signals (page visits, content engagement, hiring activity) feed an "intent score" axis that can fast-track high-intent accounts through the matrix |
| **ASC 606** | Customer segment + revenue tier informs whether customer-specific accounting treatment (rev share, deferred recognition triggers) applies |
| **Synthesis** | Account-aware framing in the orchestrator's verdict summary (e.g., "Series-D, 280 FTE, hiring 12 GTM roles last 90 days — pattern indicates pre-IPO push, supports the discount") |

The dashboard (`components/dashboard/`) reserves a Clay KPI tile that activates when the integration ships. The demo-data banner system (`components/demo-data-banner.tsx`) already has a **Variant D** branch reserved for Clay-enriched deals — copy, rendering, and disclosure language all exist; only the `hasClayEnrichment` predicate needs a real backing signal.

---

## Discovery — what we found

The original build assumption was that Clay's MCP server would be consumable like any other MCP server — a URL, an auth token, a `streamable-http` transport, and Kiln's existing `@anthropic-ai/claude-agent-sdk` integration would handle the rest.

That turned out to be incorrect. The discovery sequence:

1. **Clay's MCP page** at `app.clay.com/settings/mcp` does not surface a copyable Clay-domain MCP endpoint URL. Instead, the surfaced action is a deep-link into Claude Desktop's connector marketplace.
2. **Connection attempts** from a Node MCP client to the marketplace-style URLs (`claude.ai/directory/*`) are intercepted by Cloudflare's bot challenge — the URLs are not designed to be programmatically consumed.
3. **Manual reverse-engineering** of the auth handshake confirmed the bottleneck: Clay's MCP server's OAuth flow is designed around two specific clients — Claude Desktop and ChatGPT — both of which handle the OAuth dance internally. An arbitrary Node MCP client cannot replicate that handshake without Clay supporting **MCP Authorization** (the spec's OAuth 2.1 + PKCE flow that the MCP standard defines for third-party clients).

This is not a critique of Clay's architecture. The Claude-Desktop-and-ChatGPT-only auth design is reasonable for a consumer-facing AI product — most users connect Clay to those clients, not to bespoke Node services. It just has implications for autonomous server-side integration.

---

## Architecture — the integration shape

The integration drops into the orchestrator's existing Step 2 with no surrounding redesign.

### Orchestrator flow (current vs. with Clay)

```
Step 1   Load deal from CRM (mcp__crm__get_deal)
              │
Step 2   ┌────┴────────────────┐                  ┌────┴────────────────────────────┐
         │ Exa public signals  │                  │ Exa public signals              │
         │ Vector k-NN         │   ── becomes ──► │ Vector k-NN                     │
         │                     │                  │ Clay enrichment (NEW arm)       │
         └────┬────────────────┘                  └────┬────────────────────────────┘
              │                                        │
Step 3   Dispatch 5 sub-agents in parallel        Same — agents now have Clay context in prompt
```

### Clay tool calls Kiln would make

Three Clay tools cover the orchestrator's needs:

| Tool | Purpose | Consumed by |
|---|---|---|
| `enrich_company` (by domain) | Firmographic: funding round, headcount, segment, location, technographics | Pricing, Synthesis |
| `find_contacts` (at company) | Decision-maker identification, IC vs DM breakdown | Comms |
| `get_intent_signals` | Page-visit deltas, content engagement, hiring activity | Approval, Pricing |

### Schema impact

The cached output schema (`db/seed/cached_outputs/<deal>-review.json`) bumps from v4 to v5 with a new optional `clay_enrichment` block. The `deal_reviews` row gains a `clay_enrichment_json` column (nullable; existing reviews backfill to null). Backwards-compat: any review without `clay_enrichment` continues to render — Variant D banner just doesn't activate.

### Prompt-context impact

Each affected sub-agent's system prompt (`lib/prompts/<agent>.md`) gains a `## Customer Enrichment` section that's conditionally injected when Clay data is present. The block is structured (key-value, not free-form) so the agent doesn't drift into narrative summarization.

---

## Fallback paths if direct MCP connection isn't viable

Three viable paths, ordered from cleanest to most pragmatic.

### Path 1 — Wait for Clay to ship MCP Authorization (OAuth 2.1)

The clean architectural answer. The MCP spec defines a standard Authorization flow (OAuth 2.1 with PKCE) that supports arbitrary clients. The `@anthropic-ai/claude-agent-sdk` already supports this for other connectors. When Clay implements it, Kiln's integration is a config change — register the connector, store the authorized session, dispatch tool calls.

- **Effort once shipped**: ~3–4 hours from Clay's spec ship date to a working Clay arm in the orchestrator
- **Tradeoff**: blocked on Clay's product roadmap; not actionable from Kiln's side
- **Right path for**: a long-horizon production integration

### Path 2 — Fixture-based snapshot pattern

The pragmatic shipping path that delivers most of the demo value without waiting on Clay.

1. Connect Claude Desktop to Clay (the supported client)
2. From inside Claude Desktop, query Clay's enrichment tools for each of the 5 hero scenario customers (Anthropic, Notion, Tessera, Northbeam, Reverberate)
3. Capture the raw Clay tool responses as JSON fixtures
4. Commit the fixtures to `db/seed/clay_enrichment/<customer>.json`
5. Orchestrator's Step 2 Clay arm reads from fixtures (gated by `CLAY_INTEGRATION=fixtures`) instead of issuing live MCP calls
6. The What's-real-vs-demo table in the README gets a new row disclosing the fixture approach

- **Effort**: ~2–3 hours including fixture capture
- **Tradeoff**: snapshot data is **real** Clay output schema and **real** customer data, but **stale** — visitor submissions for arbitrary new customers can't get fresh enrichment, only the 5 hero scenarios do
- **Right path for**: shipping a credible Clay arm now without waiting on the OAuth gap

### Path 3 — HTTP API direct

Some Clay workspace tiers expose direct HTTP APIs separate from the MCP server (the same primitives, different transport, simpler auth — typically a workspace API key in a header).

- **Effort**: ~3–4 hours, including API key provisioning and rewriting the Clay arm against the HTTP transport
- **Tradeoff**: blocked on workspace plan upgrade; HTTP API surface may be a subset of the MCP tool set
- **Right path for**: production integration where the workspace already has the right plan tier

---

## Why the integration was scoped but not shipped in this build

The decision: ship a complete multi-agent system end-to-end first, with Clay integration as the natural depth-add for the next iteration. The artifact's primary signal is multi-agent orchestration, MCP server architecture, and operator-grade financial modeling — all of which had to land before Clay enrichment could compound on top of them. Adding a half-implemented Clay arm to an otherwise-complete system would have weakened the artifact, not strengthened it.

The discovery work (the OAuth gap, the three fallback paths, this document) happened regardless. What didn't happen is the fixture capture and the orchestrator-arm wiring — both deferred to post-application.

---

## JD-aligned features the integration unlocks

The Clay arm is not a generic enrichment add-on. It maps to specific features that increase Kiln's value as a proxy for the Deal Strategy & Ops role.

### Account-aware pricing

The Pricing agent ingests Clay's intent signals to infer customer urgency. Concrete example: a customer with a 5x increase in pricing-page visits over the trailing 30 days has different willingness-to-move than a flat-trend customer at the same stage. The Pricing agent's discount recommendation factors that signal — surfacing a lower discount floor for high-intent accounts and a deeper-but-conditional structure for low-intent ones.

### Buyer-committee mapping

The Comms agent uses Clay's contact data to distinguish decision-makers from ICs. The AE briefing email shifts tone and content depending on which seat the next conversation is with — economic buyer email is structured around ROI and approval friction; technical-buyer email is structured around integration depth and time-to-value.

### Intent-triggered approval fast-tracking

The approval matrix gains an **intent score axis**. Accounts above the 90th-percentile intent score get fast-track routing — fewer approval steps, parallel rather than sequential signoffs. Accounts below the 25th percentile get extra scrutiny because low intent paired with a custom deal often signals the AE pushing rather than the customer pulling. The rule lives in the editable approval matrix, so the deal desk owns the threshold.

### Live deal-desk dashboard signals

The dashboard's locked Clay KPI tile activates with live counts:

- **Clay-enriched**: N / 40 deals
- **Intent score median** across the active pipeline
- **Decision-maker coverage rate** — percentage of active deals where a verified decision-maker is mapped

These tiles give a deal desk operator a live, account-aware read on the pipeline, not just a deal-level read.

---

## What this doc is NOT

- **Not implementation-ready code.** It's a plan and architecture decision record. The orchestrator file paths, schema bumps, and tool names are concrete; the implementation work is not done.
- **Not a commitment that Kiln will be updated post-application.** It's a statement of what *would* be built if the work continued.
- **Not a critique of Clay's MCP architecture.** The Claude-Desktop-and-ChatGPT-only auth design is reasonable for a consumer-facing AI product. The implications for arbitrary Node services are real but secondary to the primary use case.
- **Not a Clay-product feature pitch.** The features above are Kiln features that *consume* Clay; they're not features Clay should build.

---

## Next concrete steps if/when the build continues

In execution order:

1. **Verify workspace tier** — check whether the Clay workspace plan exposes direct HTTP APIs (Path 3 viability)
2. **If Path 2 (fixtures) chosen**: capture fixtures via Claude Desktop for the 5 hero scenarios (Anthropic, Notion, Tessera, Northbeam, Reverberate) — ~30 minutes
3. **Implement Step 2 Clay arm** in `lib/agents/orchestrator.ts` behind a feature flag: `CLAY_INTEGRATION=fixtures | live | off`
4. **Update agent prompts** in `lib/prompts/` with the conditional `## Customer Enrichment` block (Pricing, Comms, Approval, ASC 606, Orchestrator synthesis)
5. **Activate the locked KPI tile** on the dashboard — wire the live counts to the new `clay_enrichment_json` column
6. **Update Variant D banner copy** in `components/demo-data-banner.tsx` — Variant D was reserved during Phase 8 with placeholder copy; refine once real Clay data is flowing
7. **Bump cache schema v4 → v5** with a backfill migration that nulls `clay_enrichment_json` on all existing rows

Each step is independently shippable. After step 3, the orchestrator runs end-to-end with Clay enrichment for whichever scenarios have fixtures (or for all customers if Path 1 / Path 3 is live). Steps 4–7 are polish and surfacing — they make the integration visible, not functional.
