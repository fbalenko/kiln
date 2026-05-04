# 07 — Extra Features

These are the features that elevate the artifact from "good demo" to "this person could ship at Clay tomorrow." They're all interactive — the HM can poke at each one and break things on purpose.

> **Build order**: Ship the core (Tiers 1–3 + Slack + Exa + Vector) first. Then layer these on. Each feature here is independently shippable.

---

## 1. Interactive Pricing Modeler

**Why it exists**: Demonstrates ASC 606 fluency and pricing intuition simultaneously. The HM watches a margin number change as they drag a discount slider and sees the rev rec schedule re-calculate live.

### Where it lives

Embedded in the deal detail view, between the agent outputs and the audit log. Default-collapsed; expand to interact.

### Inputs (all interactive)

- **Discount %** slider (0% to 60%, step 1%)
- **Term length** slider (12 to 60 months, step 6)
- **Ramp length** slider (0 to 12 months, step 3)
- **Payment cadence** radio (Net 30 | Net 60 | Annual upfront | Quarterly)
- **Usage commit %** slider (only visible if pricing model is hybrid or usage-based; 0%–100% commit utilization)

### Outputs (live-updating)

A four-column dashboard above the inputs:
1. **Effective discount** — accounts for ramp + free periods, not just headline %
2. **Margin estimate** — assumes 40% gross margin at list (disclaimed)
3. **Y1 revenue recognized** — under ASC 606 with the current settings
4. **TCV** — total contract value

Below the dashboard, a small chart: **revenue recognition curve over the term**, with bars for each quarter showing recognized revenue. As sliders move, bars animate to new heights.

### Implementation

- All math runs client-side in pure TypeScript (no API calls). 60fps response.
- The math functions live in `lib/pricing-math/` and are imported by both the modeler component AND the Pricing Agent's prompt context (the agent should be able to reference the same math the modeler uses).
- Disclaimer below the chart: *"Margin assumes 40% gross margin at list price. Real margin depends on COGS we don't have visibility into. Treat as directional."*

### "Reset to deal as proposed" button

After the visitor plays with sliders, a single click restores the original deal's values. Critical — visitors who feel trapped after exploring are visitors who churn.

---

## 2. Approval Matrix Editor

**Why it exists**: Lets the HM configure an approval matrix and re-run a deal against it. Demonstrates that the system isn't hardcoded — it's a real configurable engine.

### Where it lives

A separate page at `/approval-matrix` linked from the main nav and from the Approval Agent's output card.

### UI

- Table of rules, each editable inline
- Each rule has: Rule name | Condition (visual builder) | Required approver | Priority | Notes
- "Add rule" button at bottom
- "Reset to default matrix" button at top
- "Test against deal..." dropdown to pick a deal and run the approval agent against the current matrix

### Condition builder

The condition builder is a small visual UI:
- "When [field] [operator] [value]" rows
- Combinators: AND / OR
- Field dropdown: discount_pct, acv, tcv, term_months, has_clause:MFN, has_clause:rollover_credits, etc.
- Operators: `>`, `>=`, `<`, `<=`, `==`, `contains`
- Value: numeric or boolean depending on field

### Persistence

Custom matrices are stored in-memory per session (cookie-keyed). Reset on session end. Don't persist to DB — that adds auth complexity we don't want.

### "Compare with default" view

A side-by-side view showing how a single deal routes under the default matrix vs. the visitor's custom matrix. Highlights changes in red/green diff style. This is the killer feature — the HM tweaks one rule and immediately sees how it affects routing.

---

## 3. CPQ Comparison Panel

**Why it exists**: Directly addresses the JD's CPQ requirement ("Proficiency in CPQ tools"). Shows the HM that I understand CPQ semantics by demonstrating what a vanilla CPQ would output vs. what Kiln outputs.

### Where it lives

Embedded in the deal detail view as a collapsible section between the Pricing output and the ASC 606 output.

### Two-column layout

| Standard CPQ output | Kiln output |
|---|---|
| Quote with line items | Same line items + |
| Discount approval routed by % threshold | Discount approval routed by **margin impact + customer segment + clause complexity** |
| Static product catalog | Same + **dynamic alternatives based on similar past deals** |
| Pre-defined approval matrix | Same + **AI-driven matrix evaluation that handles non-standard deal types** |
| Generates an order form | Same + **redlined MSA + AE email + approval one-pager** |

### Implementation

The "Standard CPQ output" column is a static rendering of what a real CPQ (Salesforce CPQ, DealHub, Conga) would produce given the same inputs. Hardcoded to look like a real CPQ output.

The "Kiln output" column references the actual agent outputs from the current deal review.

### A small intro line at the top

> "CPQ tools are the deal-desk standard. Kiln is not a CPQ replacement — it's an orchestration layer that augments CPQ outputs with reasoning. Here's what a standard CPQ would surface vs. what Kiln adds."

This framing matters. Don't pretend Kiln replaces CPQ. Frame it as augmentation.

---

## 4. Eval Harness

**Why it exists**: Engineers don't ship agent systems without evals. Showing an eval harness signals "this person knows how to ship LLM systems," which directly maps to the resume's "evaluation pipelines" line.

### Where it lives

A page at `/eval` linked from the "How it works" page and the GitHub README.

### What it shows

A leaderboard view: each of the 5 hero scenarios x each sub-agent = 25 cells. Each cell shows:
- Pass/fail status against ground truth
- Score (0–100)
- Click to expand: agent's actual output vs. ground truth, side-by-side diff

### Ground truth

Each scenario has hand-written ground truth in `lib/eval/scenarios/<scenario>.ts`:
- Pricing: which guardrails should fire, what alternatives should be proposed
- ASC 606: which performance obligations, which red flags
- Redline: which clauses to flag, which counters to propose
- Approval: which approvers should be required, in what order
- Comms: tone targets, must-include phrases

### Scoring

For each agent's output, compute a structured score:
- **Hard checks** (boolean): did it flag clause X? did it route to CFO? Pass/fail.
- **Soft checks** (similarity): does the alternative structure match the ground truth's structure? 0–100.
- **Schema check**: does the output conform to the Zod schema? Pass/fail.
- Weighted average → cell score.

### "Run eval" button

A button that re-runs the full eval suite live. Shows progress. Takes ~5 minutes for all 25 cells. The HM can watch the system grade itself.

### What this signals

- I know how to write evals for agent systems
- I treat agent quality as measurable, not vibes-based
- The scoring is structured and inspectable
- The system has been tested before being put in front of them

---

## 5. Audit Log

**Why it exists**: Compliance is a real concern in deal desk (the JD calls out "ensure deal compliance"). The audit log proves every decision is traceable.

### Where it lives

Embedded as a collapsible panel at the bottom of every deal detail view.

### What it shows

A chronological list of every individual agent decision in the run:
- Timestamp
- Agent name
- Step label
- Tools called (chip list)
- Duration (ms)
- Tokens used
- Click to expand: full input JSON, full output JSON, reasoning text

### Export

A "Download audit log (.json)" button at the top. Downloads the full trace as a single JSON file. Useful for compliance review. The HM can imagine handing this to an auditor.

### Filterable

Filter by agent, by severity (only show steps with warnings), by tool. Search box at the top.

### Why this beats a chatbot

Chatbots don't have audit logs. Showing this signals: this isn't a chat wrapper. It's a system with provenance.

---

## 6. Customer Health Score (lightweight)

**Why it exists**: Real deal-desk decisions factor in customer health (renewals, expansions, churn risk). This shows the system is aware of customer state, not just deal terms.

### Where it lives

In the customer card on the deal detail view. A 0–100 score with a colored ring (green > 70, amber 40–70, red < 40).

### How it's computed

Pseudo-formula (deterministic per customer in the seeded data):
```
score = 
  + 30 * (feature_adoption_pct / 100)
  + 25 * (login_frequency_normalized)
  + 20 * (support_ticket_health)        // fewer is better
  + 15 * (NPS_normalized)
  + 10 * (paid_features_used / paid_features_purchased)
```

Each customer has these mock fields seeded in the DB. The score is pre-computed and stored, not re-calculated.

### How it's used

- The Pricing Agent's prompt receives the health score and is instructed: "If health < 50, lean toward 'right-size + grow back into spend' alternatives over hard discount cuts."
- The Comms Agent uses health to set tone: low health = warm/consultative, high health = collaborative/firm.
- The deal detail header shows the score next to the customer name.

### Why this matters

Demonstrates I understand that deal desk is **part of customer success**, not a separate function. Renewal-at-risk scenarios (Scenario 4) directly use this.

---

## 7. "Replay this deal" button (delight feature)

**Why it exists**: A small UX delight. Lets the HM re-run a deal and watch the agents work again — useful if they want to show a colleague.

### Where it lives

Top-right of every deal detail page, next to "Reset & re-run."

### What it does

- Discards the cached review for this deal
- Re-runs the orchestrator from scratch
- Streams the events again (live, not from cache)
- Generates a new review_id (preserves the old one in audit history)

### Tiny detail

Add a small info tooltip: "Re-running may produce slightly different output (the agents are non-deterministic)." This sets the right expectation and signals technical honesty.

---

## 8. Sandbox Slack workspace tour

**Why it exists**: A small guided tour the first time a visitor joins the demo Slack workspace.

### Implementation

When a visitor clicks "Join the demo Slack" and arrives, the workspace's `#general` channel has a pinned message:

> 👋 **Welcome to the Kiln demo workspace.**
> 
> This is a real, working Slack environment that connects to the Kiln deal desk co-pilot.
>
> Quick tour:
> - `#deal-desk` — every deal review in the demo posts here. Click into any thread to see the full agent reasoning.
> - `#pricing-questions` — a few seeded conversations between AEs and RevOps about pricing edge cases.
> - `#approvals` — mock approval threads showing how the matrix routes.
>
> Try this: open the demo at [DEMO_URL], click the "Anthropic Strategic Expansion" scenario, and watch the post arrive in `#deal-desk` ~60 seconds later.
>
> Built by Filip Balenko. Open-source repo: [github.com/fbalenko/kiln](https://...).

This message is the closer. The HM joining the workspace and reading this is one click away from understanding the entire system.

---

## Build order

Build features in this order — it's a dependency-aware sequence, with the highest-impact-per-effort items first:

1. Interactive Pricing Modeler (the "play with it" experience)
2. Audit Log (credibility / engineering signal)
3. Approval Matrix Editor (Tier 2 power-user delight)
4. Customer Health Score (small, high-leverage)
5. Eval Harness (engineering-rigor signal in the GitHub repo)
6. CPQ Comparison Panel (directly addresses JD)
7. Live Google Sheets integration (opens the .xlsx workbook live in Sheets — see `docs/10-sheets-integration.md`)
8. Replay button (small UX delight)
9. Slack workspace welcome message (the closer for any HM who joins the workspace)

All nine ship. Order matters because some features depend on data or infrastructure that earlier features establish (e.g., the Audit Log UI depends on the audit log table which is populated by the agent runs from earlier phases).
