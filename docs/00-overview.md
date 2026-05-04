# 00 — Overview

## The audience and the bet

The single user this product is designed for is the hiring manager (HM) of the **Deal Strategy & Ops** role at Clay. Everything else is downstream of that. They will open the link on their phone, between meetings, with low patience and high skepticism. We have ~15 seconds to flip them from skeptical to curious, and ~5 minutes to convert "curious" into "I want to talk to this person."

The bet behind the artifact: **a working multi-agent system that simulates the role itself is more credible than any memo, deck, or resume bullet.**

## The demo arc (what success looks like)

The HM's full journey, in order:

1. **Receive a Slack/email DM from a mutual friend** with a single line about Filip and a link.
2. **Open the link on their phone**, see the pipeline view already populated with 5 realistic deals.
3. **Click the highlighted "Start here" scenario** and watch the orchestrator + 5 sub-agents stream their reasoning in real time, producing a complete deal review in ~60 seconds.
4. **Notice the live Slack post** — the same deal review they just watched is now sitting in a real Slack workspace they can join.
5. **Click into the generated artifacts** — download the redlined MSA, see the AE email draft, inspect the agent's reasoning trace.
6. **Submit their own deal** through the structured form. Watch the same pipeline run on their input.
7. **Read the "If we built this in Clay" appendix**, which proposes the same workflow could run on Clay's actual product (tables, waterfalls, Claygent).
8. **Forward the link to one teammate.**
9. **Reply to the friend's DM**: "Send me his resume."

That sequence is the success criterion. Every feature in this build advances that arc.

## Success metrics (self-imposed)

| Metric | Target |
|---|---|
| Time to first "wow" (visitor land → impressive thing happens) | < 15 seconds |
| Time to first scripted scenario completion | < 60 seconds |
| Mobile rendering quality | indistinguishable from desktop |
| Bounce rate before scenario completes | < 30% (proxy: did they click into a result?) |
| Conversion rate to "Try your own deal" | > 25% of visitors who finish a scripted scenario |
| Number of pre-loaded scenarios that run end-to-end without errors | 5 / 5 |

## What we are deliberately *not* building

The following are out of scope by design:

- User accounts, login, auth
- Multi-tenancy of any kind
- Persistent visitor history (each session is fresh)
- A native mobile app
- Payment processing or billing simulation
- Real-time collaboration (multiple users on one deal)
- A public API for external apps to call Kiln
- A general-purpose LLM chat interface
- Anything that requires Clay's actual pricing data we don't have access to

If a stakeholder asks "could you also...", the answer is "yes, post-launch." Stay disciplined.

## Tone

The artifact has a tone. It is:

- **Confident but humble.** The system makes recommendations, not pronouncements. Every output includes uncertainty/confidence framing where appropriate.
- **Honest about its limits.** The footer of the demo and the README both explicitly state: *"I don't have insider visibility into Clay's actual pricing or deal patterns. Assumptions are inferred from public materials and standard usage-based SaaS practice. Read this as a demonstration of approach, not an audit."*
- **Built, not pitched.** No "AI-powered" superlatives. No marketing language. The product speaks for itself.
- **Open by default.** The repo is public. The prompts are forkable. The data model is documented. We're inviting Clay to use this, not gatekeeping.

## The artifact ecosystem

Kiln is one of three potential forwardable artifacts. The HM's package contains:

1. **The live tool** at the deployed URL (the primary artifact)
2. **The open-source repo** at `github.com/fbalenko/kiln` with the prompts, agent architecture, deal desk policy template, and "If we built this in Clay" appendix
3. **An optional 90-second Loom walkthrough** — for the HM who won't click through. Skip if the live tool is polished enough to stand on its own.

Everything in this build serves at least one of those three deliverables.
