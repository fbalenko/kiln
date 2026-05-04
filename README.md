# Kiln — A Working Deal Desk Co-Pilot for Clay

> "Where clay gets fired into final form."

Kiln is a multi-agent deal desk co-pilot purpose-built as a working artifact for the Clay Deal Strategy & Ops application. It is **not** a portfolio piece. It is a real, hosted, interactive tool that the hiring manager can play with on their phone in 60 seconds — and that the Clay team could (in principle) fork and use.

## What it does

Given a non-standard deal — custom pricing, discount stacking, ramps, MFN clauses, partnership structures — Kiln runs a multi-agent review pipeline that produces:

- A pricing & margin analysis with live ASC 606 implications
- Flagged contract risks with suggested counter-positions
- Routed approval (correctly mapped to the configurable approval matrix)
- A pre-loaded Slack post in a real demo workspace
- Generated artifacts: redlined MSA, populated order form, AE email draft, approval-review one-pager
- Surfaced "similar past deals" via vector search over an institutional-memory layer
- Public customer signals via Exa (recent funding, headcount, leadership moves)

## Why this exists

This is the artifact that goes attached to a referral DM to the Clay Deal Strategy & Ops hiring manager. The friend's message is one line: *"He shipped a working multi-agent deal desk co-pilot for Clay. Pre-loaded scenarios, live Slack flow, HM can submit their own deal. Worth 5 minutes."*

The whole product is engineered around making that 5 minutes feel like 30.

## Quick start (for Claude Code)

1. Open this directory in your terminal.
2. Launch Claude Code in autonomous mode:
   ```bash
   claude --dangerously-skip-permissions
   ```
3. Tell it: *"Read CLAUDE.md and start with Phase 0 in docs/08-build-plan.md."*
4. Step through phases sequentially. Don't skip ahead.

## Repo map

```
kiln/
├── README.md                  ← you are here
├── CLAUDE.md                  ← primary instruction file Claude Code auto-loads
├── .claude/
│   └── settings.json          ← permission config (bypassPermissions)
└── docs/
    ├── 00-overview.md         ← product spec, demo arc, success criteria
    ├── 01-architecture.md     ← system design + tech stack
    ├── 02-data-model.md       ← DB schema, mock data spec
    ├── 03-agents.md           ← orchestrator + 5 sub-agents
    ├── 04-scenarios.md        ← the 5 hero scenarios in deep detail
    ├── 05-ui-ux.md            ← three-tier interaction model, design system
    ├── 06-integrations.md     ← Slack, Exa, vector search, doc generation
    ├── 07-extra-features.md   ← pricing modeler, approval editor, CPQ compare, eval, audit, health score
    ├── 08-build-plan.md       ← day-by-day phased build plan
    ├── 09-deliverables.md     ← policy doc, "if we built this in Clay", repo README, Loom script
    ├── 10-sheets-integration.md ← Excel .xlsx + live Google Sheets integration
    └── 11-how-it-works-page.md  ← spec for the in-app /how-it-works page (diagrams, tables, worked example)
```

## Design constraints

- 0 auth screens
- Visitor sees the system do something impressive in their first interaction
- Mobile-first (test 6" screen before desktop)
- Open-source repo with permissive license
