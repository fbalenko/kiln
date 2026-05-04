# 09 — Deliverables

The artifact ecosystem includes more than just the live tool. These are the supporting deliverables that go into the GitHub repo and the friend's referral message.

---

## 1. Public-facing repo README.md

This README is what someone sees when they land on `github.com/fbalenko/kiln`. It is **distinct** from the spec README at the top of this docs folder. It's written for a public audience: deal desk practitioners, GTM ops engineers, the Clay team, and anyone who finds it via the open-source community.

### Content outline

```markdown
# Kiln

A multi-agent deal desk co-pilot. Built as a working artifact for a job application to Clay's Deal Strategy & Ops team — and open-sourced for anyone building in this space.

[Demo →]([DEMO_URL]) · [Architecture →](#architecture) · [Why I built this →](#why-this-exists)

## What it does

[3-4 sentence elevator pitch with one screenshot]

## Quick demo

[Embedded GIF of the Anthropic scenario running end-to-end, ~30 seconds]

## Architecture

[The architecture diagram from docs/01-architecture.md, as an SVG]

Five specialized agents (Pricing, ASC 606, Redline, Approval, Comms) coordinated by an Orchestrator, with tool access to:
- A mock CRM (SQLite)
- Vector similarity search over past deals (sqlite-vec)
- Public customer signals via Exa
- A real Slack workspace
- PDF/DOCX generation for redlined contracts

## Try it locally

[Standard "git clone, npm install, env vars, npm run dev" instructions]

## Why this exists

This was built as an interview artifact for Clay's Deal Strategy & Ops role. Rather than write a memo about how I'd think about deal desk, I built a working version of what I'd build at Clay and pointed at it. The idea was that an artifact you can play with is more credible than any deck.

If you're a Clay team member reading this: the prompts, agent architecture, and policy templates are all in this repo under MIT license. Fork freely.

## What I'd improve next

[A short, honest list — shows engineering humility]
- Production CPQ integration (Salesforce CPQ, DealHub) — currently mocked
- Real customer data (anonymized) instead of seeded fake deals
- Multi-tenancy if used by more than one company
- Long-term memory across deal reviews (currently each review is independent)
- Native Slack actions (currently posts only; doesn't accept reactions back)

## Open-source license

MIT. Take it, fork it, ship it.

## Built by

Filip Balenko · [LinkedIn](https://www.linkedin.com/in/filipbalenko/) · filippbalenko@gmail.com · [extrabusinessfunding.com](https://www.extrabusinessfunding.com/)
```

### Tone

- No marketing language
- No "AI-powered" superlatives
- Engineer-to-engineer voice
- Honest about limitations

---

## 2. Deal Desk Policy Template (PDF, 8–12 pages)

A real, practical deal desk policy document the Clay team could fork and customize. Hosted in the repo at `public/deal-desk-policy-template.pdf` and linked from the demo footer + the GitHub README.

### Sections

1. **Purpose & scope** — what this document covers and who it's for
2. **Pricing guardrails**
   - Default discount thresholds by segment (Enterprise / Mid-market / PLG)
   - Margin floor protections
   - Ramp length limits
   - Free-month limits and policy
3. **Approval matrix**
   - Default approval levels by ACV
   - Triggering conditions for additional approvers
   - Standard escalation paths
   - Non-standard deal type handling
4. **Standard contract structure**
   - Default payment terms (net 30, annual upfront preferred)
   - Termination rights (Clay's standard position)
   - Auto-renewal language
   - Liability caps
5. **Non-standard clause handling**
   - MFN clauses: position, common counters, fallback
   - Rollover credits: ASC 606 implications, when acceptable
   - Exclusivity windows: rarely accepted, specific conditions
   - Custom data residency: process for evaluation
   - Out clauses: when acceptable, term-length adjustments
6. **ASC 606 quick reference**
   - Performance obligation identification
   - Variable consideration treatment
   - Common Clay-specific patterns (usage commits, ramps, rollover)
7. **Deal velocity targets**
   - Approval cycle time SLAs
   - Escalation triggers when SLAs miss
8. **Templates & resources**
   - Counter-proposal language library
   - AE email templates by deal type
   - Customer email templates by tone
9. **Glossary** — common terms and what they mean in Clay's context

### Tone

- Generic enough to be useful (any SaaS company could fork it)
- Specific enough to feel real (not just bullet points — has actual policy positions)
- Clearly marked as a TEMPLATE — not Clay's actual policy

### Disclaimer at top

> *This is a template document published for general use. It is not Clay's actual deal desk policy. The author has no insider knowledge of Clay's pricing, approval matrix, or contract standards. Customize before use.*

---

## 3. "If We Built This In Clay" Appendix (in-app page)

A page at `/if-clay-built-this` that shows how the entire Kiln workflow could be replicated using Clay's actual product (tables, waterfalls, Claygent, HTTP API, Slack integration). This is meta and flattering — *"your deal desk could run on your product."*

### Content outline

#### Intro
> "Kiln is built as a standalone application. But the entire workflow could be implemented inside Clay using its native primitives. Here's how."

#### The architecture mapping

| Kiln component | Clay equivalent |
|---|---|
| Mock CRM (SQLite) | Clay table populated from Salesforce via the Salesforce integration |
| Pricing Agent | Claygent prompt with a system message, run as a column on each deal |
| ASC 606 Agent | Claygent prompt with the ASC 606 reasoning, run as a column |
| Redline Agent | Claygent + custom instructions referencing a clause library table |
| Approval Agent | Conditional logic + waterfall with rule-based routing |
| Comms Agent | Claygent prompts for each output type, output to columns |
| Vector search | Clay's similarity column or a custom HTTP API call to embeddings |
| Exa customer signals | Clay's existing Exa integration |
| Slack posting | Clay's native Slack action |
| Audit log | A second table that appends each agent run as a row |

#### The walkthrough

A step-by-step description of how a Clay user would build this:

1. Create a `Deals` table seeded from Salesforce (use the Salesforce integration)
2. Add a `Customer Signals` waterfall column using the Exa integration
3. Add a `Similar Deals` column using a custom HTTP API call to the embeddings endpoint (or Clay's similarity column)
4. Add five Claygent columns: `Pricing Review`, `ASC 606 Review`, `Redline Review`, `Approval Routing`, `Communications Drafts`
5. Each Claygent column has a system message that mirrors Kiln's agent prompts (linked to in this appendix)
6. Add a Slack action triggered when all 5 review columns have populated, posting to `#deal-desk`
7. The whole thing runs on a daily schedule, or triggered when a new deal hits a target stage

#### The honest framing

> "This isn't a 'Clay should build a deal desk product' pitch — Clay is a general-purpose platform, and that's its strength. It's an observation that the Clay team's own deal desk could be powered by Clay, the same way many of Clay's customers run their growth operations. The appendix is offered in that spirit."

#### Why this matters for the application

This appendix is the moment where the artifact stops being "look what I built for you" and becomes "I understand your product deeply enough to propose how it could be applied." That's the level of fluency the HM is looking for.

### Tone notes

- Avoid being pedantic ("Clay supports the following…") — assume the HM knows their product better than you
- Write in the voice of "someone who has used Clay seriously" — which means actually using it before this is published
- Acknowledge uncertainty: *"I'm inferring from public docs and demos. There may be Clay primitives I'm missing."*

---

## 4. Loom Script (optional, 90 seconds)

The Loom is **optional**. If the live tool is polished and the friend's outbound message is clear, the Loom doesn't add much. Only record it if you have time and feel like the live tool needs a guided walkthrough for HMs who won't click. Skip without guilt.

If you do record one, here's the script.

### Structure

**0:00–0:08 — Hook**
> "Hey, this is Filip. I just applied for the Deal Strategy & Ops role at Clay, and rather than write a memo, I built a working version of what the role does. It's called Kiln."

[Show the pipeline view, scrolling once]

**0:08–0:25 — One-line setup**
> "Five specialized agents — Pricing, ASC 606, Redline, Approval, and Comms — coordinated by an Orchestrator. They run against a deal in about 60 seconds and produce a complete review. Let me show you on Clay's strategic enterprise expansion scenario."

[Click the Anthropic scenario, page transitions]

**0:25–0:55 — The agent pipeline running**

[Voice over while the agents stream]
> "The orchestrator pulls customer signals from Exa, finds similar past deals via vector search over an institutional memory layer, and dispatches the five agents in parallel."
>
> [Pause briefly while reasoning streams]
>
> "The Pricing Agent flagged that the headline 15% discount is actually 28% effective once the ramp and credits are factored in — and proposed three alternative structures."
>
> [Quick highlight on the Pricing card]
>
> "The Redline Agent caught five non-standard clauses including the MFN, with a counter for each. The Approval Agent routed correctly to CFO + Legal + CEO sign-off because of the MFN crossing the $1M TCV threshold."
>
> [Quick highlight on the Approval routing]

**0:55–1:10 — Slack moment**

> "And it just posted to a real Slack workspace you can join. That's the system end-to-end — every deal review hits the deal desk channel with a structured summary."

[Show the Slack post in the embed, then click "Join the demo Slack"]

**1:10–1:25 — The "play with it" close**

> "You can submit your own deal at this URL [show the form briefly], and the same agents run on it. The audit log shows every decision the agents made. The repo's open-source — prompts, architecture, deal desk policy template, all forkable."

[Show the GitHub repo briefly]

**1:25–1:30 — The ask**

> "Five-minute test drive at [DEMO_URL]. I'd love your reaction. Filip out."

### Production notes

- Record in one take. Don't over-edit. Authenticity > polish.
- Use Loom's mouse highlight feature.
- Do NOT use a script you read from — speak naturally, hit the beats.
- Background should be clean (your office, not a busy room).
- Voice level even, mic close.
- Ship at the first take where you don't fumble — perfectionism kills shipping speed.

---

## 5. The friend's outbound message

The single message that gets the package in front of the HM. Sent via Slack DM or email by Filip's connection on the Clay team.

### The message (default — no Loom)

> Hey [HM first name],
>
> My friend Filip just applied for the Deal Strategy & Ops role. Worth flagging him directly: ex-founder, ran underwriting and built AI-driven deal automation at his last firm (alt lending, $2M raised solo, 35+ deals through a proprietary system).
>
> Rather than writing a memo, he built a working multi-agent deal desk co-pilot for Clay specifically. Pre-loaded with five realistic scenarios (Anthropic-shaped expansion, PLG-to-enterprise conversion, competitive displacement, etc.), live Slack integration to a demo workspace, and you can submit your own deal to see how the system handles it. Repo is open-source.
>
> Live tool: [DEMO_URL]
> Repo: github.com/fbalenko/kiln
>
> Worth 5 minutes — I think you'll find the architecture interesting even if the candidate isn't a fit.
>
> [Friend's name]

### Optional variant (if Loom recorded)

If you do end up making a Loom (it's optional — the live tool stands on its own), insert this line above the "Live tool" line:

> 90-second walkthrough: [Loom URL]

Three entry points instead of two gives the HM more flexibility, but adds nothing if the Loom isn't crisp.

### Why this works

- Vouches for Filip without overselling
- Names the relevant background (alt lending, deal automation, $2M, 35+ deals) in one sentence
- Emphasizes "built, not pitched" — the artifact's primary virtue
- Frames the artifact as a small ask ("worth 5 minutes")
- Provides clear entry points — HM picks the easiest
- Gives the friend an out ("even if the candidate isn't a fit") — protects the relationship

### What NOT to include

- ❌ Filip's resume (clutters the message; if HM wants it, they'll ask)
- ❌ A long paragraph about why Filip wants to work at Clay
- ❌ The deal desk policy doc (link from inside the artifact)
- ❌ Multiple attachments
- ❌ "Following up on…" framing

### Timing

- Send the message **after** Filip has formally applied through the Clay careers page
- Send on a Tuesday or Wednesday, late morning ET (highest read rate)
- Do NOT follow up if no response within 5 days — let the artifact do the work

---

## 6. Application materials (separate from the artifact)

These go to Clay through the normal application channel, not via the friend.

- Resume (the deal-ops-tailored version per `docs/05-ui-ux.md` from the previous conversation thread)
- Cover letter: 3 paragraphs, links the artifact, addresses the founder-flight-risk concern proactively, names the role-specific gap (CPQ/ASC 606) honestly with a "actively closing" line
- Application form fields: standard

The artifact link goes in the cover letter. The friend's message is the warm channel; the application is the formal channel. Both should mention the artifact.

---

## Final checklist before sending

Before the friend sends the message, every item below must be true:

- [ ] [DEMO_URL] loads in <2s on mobile
- [ ] All 5 hero scenarios run end-to-end without errors
- [ ] Submit-your-own-deal works with at least 3 different test inputs
- [ ] Slack post fires reliably
- [ ] All 4 artifacts download successfully
- [ ] Audit log is complete and inspectable
- [ ] Pricing modeler is interactive and snappy
- [ ] Approval matrix editor works
- [ ] Mobile rendering tested on real phone (not just dev tools)
- [ ] Cold tester completed full flow without help
- [ ] (Optional) Loom recorded and uploaded — skip without guilt if the live tool is polished
- [ ] GitHub repo public, README polished
- [ ] Deal desk policy PDF hosted and linked
- [ ] "If we built this in Clay" appendix complete
- [ ] OG image renders correctly when URL is pasted in Slack
- [ ] Analytics installed (so we can see if HM clicked)

When all 16 items are checked: send.
