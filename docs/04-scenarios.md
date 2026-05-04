# 04 — The 5 Hero Scenarios

These are the seeded deals tagged `is_scenario = 1`. Each one is deliberately engineered to show off a different sub-agent and a different deal-desk archetype. They are the **first thing** the HM clicks. Their realism is the make-or-break of the artifact.

> **Realism standard**: every scenario should pass the test "could a Clay AE have actually written this in their CRM?" If a sentence sounds invented, rewrite it until it doesn't.

---

## Scenario 1 — Anthropic-shaped Strategic Enterprise Expansion (with MFN)

**Hero tagline**: *"$1.5M committed expansion with an MFN clause and a 6-month onboarding ramp"*

**Difficulty**: high
**Recommended (the "Start here" tag goes on this one)**: yes
**Highlights**: Redline Agent + Approval Agent

**Customer**: Anthropic (real, enterprise segment, AI/ML, ~1,500 employees)
**Deal type**: `expansion`
**Stage**: `review`
**ACV**: $500,000 (Y1) → $1,500,000 (TCV across 3-year term)
**Existing ACV**: $300,000 (current year)
**Term**: 36 months
**Pricing model**: hybrid (subscription + usage-based for data provider credits)
**Discount**: 15% off list (volume-justified)

**Customer request** (free-text, written in AE voice):
> "Anthropic wants to consolidate from 6 disparate workspaces into a single enterprise contract. They're asking for: (1) MFN clause guaranteeing they get any pricing improvement we offer to peer AI labs over the next 24 months, (2) custom data provider credits (pre-paid, $200K of the TCV applied as credits redeemable against any of our enrichment partners), (3) a 6-month onboarding ramp where they pay 50% from months 1–6 then full price from month 7 onward, (4) annual billing in arrears (not standard for us), (5) a 60-day termination-for-convenience right starting month 13. AE is pushing hard — they've already verbally committed to 'we can probably do MFN with carve-outs.' Procurement is signing in Q1, deadline-driven."

**Non-standard clauses** (JSON):
```json
["MFN_24mo_with_carveout_intent", "custom_data_provider_credits_200k", "ramp_50pct_6mo", "annual_billing_in_arrears", "termination_for_convenience_60d_starting_m13"]
```

**Competitive context**:
> "Anthropic is also evaluating in-house tooling — they have engineering bandwidth to build alternatives if pricing isn't competitive. We have a strong relationship with their RevOps lead but Procurement is new and asking aggressive questions."

**Why this scenario shines**:
- The **Redline Agent** has FIVE distinct non-standard clauses to flag, each with a meaningful counter-position
- The **Approval Agent** correctly routes this to: AE Manager → RevOps → CFO → Legal (parallel) → CEO sign-off (because of MFN crossing $1M TCV)
- The **ASC 606 Agent** has rich material: ramp creates variable consideration, MFN creates contract-modification-on-future-event risk, the credits create a complex performance obligation analysis
- The **Pricing Agent** evaluates whether the 15% headline discount is actually 15% once the ramp + credits are factored in (spoiler: effective discount is ~28%)
- The **Comms Agent** has to balance a firm-but-collaborative tone — Anthropic is a strategic logo, not a customer to lose

---

## Scenario 2 — Notion-shaped Self-Serve to Enterprise Conversion (Rollover Credits)

**Hero tagline**: *"PLG customer scaling to $180K/year — but their request changes the rev rec story"*

**Difficulty**: medium
**Highlights**: ASC 606 Agent

**Customer**: Notion (real, mid-market segment, 14-seat ask, PLG conversion)
**Deal type**: `expansion` (formally a conversion from self-serve)
**Stage**: `review`
**ACV**: $180,000
**TCV**: $360,000
**Term**: 24 months
**Existing spend**: $30,000/yr across multiple self-serve seats
**Pricing model**: subscription + usage commit (1.5M API calls/yr included, $0.0008/call overage)
**Discount**: 10% off list

**Customer request**:
> "Notion's RevOps team wants to consolidate 14 individual Pro seats and a separate Team plan into one enterprise contract. They're asking for: (1) any unused API call credits to roll over month-to-month within the contract year — they have lumpy usage and don't want to over-pay or under-purchase, (2) annual billing with quarterly true-up, (3) 4 sandbox tenants for free included with the enterprise plan. AE has soft-committed to rollover. The customer says 'we'd like to start in two weeks if we can land this.'"

**Non-standard clauses**:
```json
["rollover_credits_within_contract_year", "quarterly_true_up", "sandbox_tenants_included_free"]
```

**Why this scenario shines**:
- The **ASC 606 Agent** identifies that rollover credits = variable consideration = expected-value treatment required, and quarterly true-up = deferred revenue recognition with reconciliation periods. This is the meatiest ASC 606 case.
- The **Pricing Agent** notes that 4 free sandbox tenants represents ~$8K of giveaway value that should either be cost-allocated against margin or carved out as a separate (free) performance obligation
- The **Approval Agent** routes to AE Manager → RevOps → Finance (no CFO needed; under $500K threshold)
- The **Comms Agent** drafts a customer email in collaborative tone — this is a healthy expansion, not a hostile negotiation

---

## Scenario 3 — Competitive Displacement, Aggressive Discount Stack

**Hero tagline**: *"35% discount + 6 months free + waived implementation. Margin dies. Where's the bleed?"*

**Difficulty**: high
**Highlights**: Pricing Agent

**Customer**: "Tessera Health" (fictional mid-market healthtech, 1,200 employees)
**Deal type**: `new_logo`
**Stage**: `review`
**ACV**: $240,000 (proposed)
**Term**: 24 months
**Pricing model**: subscription
**List ACV**: $360,000
**Discount**: 35% (proposed by AE)

**Customer request**:
> "Tessera is currently using Apollo + Outreach + ZoomInfo, total spend ~$320K/yr. Their CRO wants to consolidate. AE has proposed 35% discount, 6 months free (paid term starts month 7), and waived implementation services (normally $40K). Customer is also asking for a 90-day out clause (uncommon for us) and wants to lock in 2026 pricing for any seat expansions through end of 2027. Three other vendors in the bake-off. Decision in 10 days."

**Non-standard clauses**:
```json
["6mo_free_period_before_paid_term", "implementation_services_waived_40k", "out_clause_90_day_anytime", "expansion_pricing_lock_through_2027"]
```

**Why this scenario shines**:
- The **Pricing Agent** does the most work here. It computes:
  - Headline 35% discount + 6 months free → effective discount ~52% over Y1, ~25% over the full 24mo term
  - Waived $40K implementation has the worst CAC implication (it's a cash hit, not a margin hit) — counter to common AE intuition
  - The 90-day out clause prevents revenue recognition smoothing — must use point-in-time recognition
  - Expansion pricing lock removes future upsell margin — quantifiable as ~$80K of foregone Y2 revenue
- The **Pricing Agent** produces 3 alternative structures, each materially different:
  1. Lower headline discount (25%) + keep services + 60-day out clause + no expansion lock → margin stays viable
  2. Accept 35% discount BUT services billed (not waived) + no expansion lock → trade margin for cash flow
  3. Multi-year ramp instead of free months: 50% off Y1, 75% Y2, full price implicit Y3 commitment → preserves expansion path
- The **Comms Agent** drafts an AE email that pushes back firmly: *"Before we send this to Approval, can we walk through whether the implementation waiver is actually the cheapest concession we could give?"*

---

## Scenario 4 — Renewal-at-Risk with Commit Reduction

**Hero tagline**: *"$400K customer hit only 60% of commit. CSM wants to give them 30% off renewal. Should we?"*

**Difficulty**: high
**Highlights**: Pricing Agent + Comms Agent + Customer Health Score (extra feature)

**Customer**: "Northbeam Mortgage" (fictional fintech, 850 employees)
**Deal type**: `renewal`
**Stage**: `review`
**Existing ACV**: $400,000
**Proposed renewal ACV**: $280,000 (30% reduction)
**Term**: 12 months (renewal)
**Pricing model**: subscription with usage commit
**Health score**: 42 / 100 (low — see extra features doc)

**Customer request**:
> "Northbeam used 60% of their committed credits. They're asking for: (1) 30% reduction to $280K base, (2) shift to usage-based for any overage above the new commit, (3) extension of payment terms from net-30 to net-60. CSM is panicking — Northbeam is a flagship logo in fintech. CSM proposed accepting all three. Their CRO will sign in two weeks; competitor (a recent Y Combinator startup with 60% lower pricing) has been pitching them aggressively."

**Non-standard clauses**:
```json
["commit_reduction_30pct", "switch_to_usage_based_for_overage", "payment_terms_net_60"]
```

**Why this scenario shines**:
- The **Pricing Agent** examines product usage data (pulled from CRM mock fields like `feature_adoption_pct`) and identifies that Northbeam hasn't adopted 3 of the 5 features they're paying for. The recommendation: don't just discount — **right-size the SKU mix and add a usage-based overage** that lets them grow back into spend.
- Three alternatives:
  1. Right-size to $300K subscription + $0.0008/call overage → likely lands at ~$340K with overage in Y1
  2. Accept the 30% cut but lock in a 24-month renewal (commit acquisition vs. revenue) — shows commit acquisition > short-term revenue
  3. Hybrid: pause-and-play discount — give 6 months at 30% off, then revisit; structures commitment
- The **Comms Agent** drafts a customer email that's warm and consultative — *"We hear you on the under-utilization. Let's structure this so you only pay for what you'll use, with room to grow back."* — and a Slack post to CSM's manager flagging the at-risk situation
- This scenario is the one that demonstrates the system isn't just an approval rubber stamp; it makes business judgments

---

## Scenario 5 — Agency Partnership, White-Label + Rev Share

**Hero tagline**: *"Top-50 GTM agency wants to white-label Clay for client work. Standard approval matrix doesn't apply."*

**Difficulty**: expert
**Highlights**: Approval Agent (escalation path)

**Customer**: "Reverberate Growth" (fictional top-50 GTM agency, 80 employees)
**Deal type**: `partnership`
**Stage**: `review`
**TCV**: $0 base + revenue share TBD
**Term**: 24 months partnership
**Pricing model**: `one_time` (the deal type is unusual — not really a paid contract)

**Customer request**:
> "Reverberate is a top-50 GTM agency that uses Clay heavily for client engagements. They've proposed a strategic partnership: (1) white-label Clay tables and waterfalls under their own product 'Reverberate Engine', (2) 25% rev share on all Reverberate Engine subscriptions paid by their clients (estimated $400K–$1.2M annual contribution to Clay), (3) co-marketing rights including case studies with their clients, (4) early access to new Clay features 30 days before public launch. Reverberate's founder is well-connected in the GTM ops community and has 8 of our top-50 customers as their clients. AE doesn't have authority over partnership deals; routed to us by RevOps."

**Non-standard clauses**:
```json
["white_label_branding", "rev_share_25pct", "co_marketing_with_client_attribution", "early_access_30d_advance"]
```

**Why this scenario shines**:
- The **Approval Agent** correctly identifies this as a NON-STANDARD deal type that bypasses the usual matrix and routes to a custom approval path:
  - Strategic Partnership Review Committee (CEO, COO, CMO)
  - Legal review for white-label IP licensing terms
  - Product review for the early-access agreement
  - Finance review for rev-share accounting treatment
- The **Pricing Agent** explicitly defers — this isn't a pricing decision, it's a partnership structure decision. The agent says so: *"This deal does not fit our standard pricing analysis. The financial value is rev share, not ACV. Recommend escalation to Strategic Partnership Review."*
- The **ASC 606 Agent** flags rev-share as a principal-vs-agent question under ASC 606 — does Clay book gross or net revenue from white-label client subscriptions?
- The **Redline Agent** has a field day with white-label terms (trademark grants, sublicense scope, termination triggers) and rev-share definitions
- This scenario shows the system handles **deal types that break the normal approval matrix** — a critical signal for a deal desk hire

---

## Scenario design principles (so future scenarios maintain quality)

1. **Each scenario must have at least 3 non-standard clauses.** Single-issue deals are boring.
2. **Each customer must have a specific competitive context.** "Three other vendors in the bake-off" is enough; abstraction kills realism.
3. **Each AE-voice quote must include at least one verbatim phrase that sounds like internal Slack chatter.** "AE has soft-committed to..." or "CSM is panicking" or "deal goes to Procurement Friday."
4. **Each scenario must produce a different recommended approval path.** Otherwise the Approval Agent looks like it's rubber-stamping.
5. **At least one scenario per archetype**: enterprise expansion, PLG conversion, competitive displacement, renewal at risk, partnership/non-standard.

If we add scenarios beyond the initial 5, this checklist must apply to each one.
