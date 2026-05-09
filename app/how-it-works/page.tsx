import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MermaidDiagram } from "@/components/how-it-works/mermaid-diagram";
import { SchemaTabs } from "@/components/how-it-works/schema-tabs";
import { buttonPrimary, buttonSecondary } from "@/lib/ui-tokens";

export const metadata = {
  title: "How it works · Kiln",
  description:
    "Architecture, agents, MCP servers, and a worked example of a Kiln deal review.",
};

const HIGH_LEVEL_FLOW = `sequenceDiagram
    autonumber
    participant V as Visitor
    participant O as Orchestrator (Opus 4.7)
    participant T as Tools (CRM · Vector · Exa)
    participant Subs as 5 Sub-agents (parallel)
    participant Slk as Slack #deal-desk
    participant Out as Artifacts (DOCX · PDF · XLSX · EML)

    V->>O: Run review on deal
    O->>T: Step 1 — fetch deal
    T-->>O: Deal record
    par Step 2 — gather context (parallel)
        O->>T: Vector k-NN over 40 deals
        T-->>O: 3 similar past deals
    and
        O->>T: Exa public signals
        T-->>O: 3-5 customer signals
    end
    par Step 3 — Promise.all dispatch
        O->>Subs: Pricing
        O->>Subs: ASC 606
        O->>Subs: Redline
    end
    Subs-->>O: 3 typed outputs
    O->>Subs: Step 4 — Approval routing (Haiku 4.5)
    Subs-->>O: ApprovalOutput
    O->>Subs: Step 5 — Comms drafts (Sonnet 4.6)
    Subs-->>O: CommsOutput
    O->>Slk: Block Kit post
    O->>Out: Generate 5 artifacts
    O-->>V: Synthesis (4-sentence verdict)`;

const DATA_FLOW = `graph LR
    CRM[("SQLite CRM<br/>40 deals · 30+ customers")]
    Vec[("sqlite-vec<br/>1536-dim embeddings")]
    Exa[("Exa API<br/>public signals")]
    Cache[("cached_outputs/<br/>5 hero scenarios")]
    Orc{{"Orchestrator<br/>Opus 4.7"}}
    Pri["Pricing<br/>Sonnet 4.6"]
    Asc["ASC 606<br/>Opus 4.7"]
    Red["Redline<br/>Sonnet 4.6"]
    Apv["Approval<br/>Haiku 4.5"]
    Com["Comms<br/>Sonnet 4.6"]
    Slk["Slack<br/>kiln-demo"]
    Doc["DOCX · PDF · XLSX · EML"]
    Aud[("audit_log")]

    CRM --> Orc
    Vec --> Orc
    Exa --> Orc
    Cache -.cached replay.-> Orc
    Orc --> Pri
    Orc --> Asc
    Orc --> Red
    Pri --> Apv
    Asc --> Apv
    Red --> Apv
    Apv --> Com
    Com --> Slk
    Com --> Doc
    Orc --> Aud

    classDef store fill:#f5f5f5,stroke:#737373,stroke-width:1px,color:#0a0a0a
    classDef agent fill:#fafaf9,stroke:#0a0a0a,stroke-width:2px,color:#0a0a0a
    classDef out fill:#fff7ed,stroke:#c2410c,stroke-width:1px,color:#0a0a0a
    class CRM,Vec,Exa,Cache,Aud store
    class Orc,Pri,Asc,Red,Apv,Com agent
    class Slk,Doc out`;

const SECTIONS = [
  { id: "loop", label: "The 60-second loop" },
  { id: "agents", label: "The agents" },
  { id: "data-flow", label: "Data flow" },
  { id: "mcp", label: "MCP servers" },
  { id: "worked-example", label: "Worked example" },
  { id: "caching", label: "Caching strategy" },
  { id: "schemas", label: "Output schemas" },
  { id: "stack", label: "Tech surfaces" },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-16 sm:px-6 sm:pt-6">
      <header className="border-b border-border pb-5">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
          Kiln · Architecture
        </p>
        <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-foreground">
          How Kiln works
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
          The agent topology, the dispatch order, the data flow, and a
          minute-by-minute walkthrough of a real review run. Read top-to-bottom
          in about three minutes; jump in via the table of contents below.
        </p>
        <nav className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-[12px]">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-muted-foreground transition hover:text-foreground hover:underline"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      {/* SECTION 1 — high level loop */}
      <section id="loop" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          1 · The 60-second loop
        </h2>
        <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-foreground">
          <p>
            A reviewer (or a visitor) selects a deal. The orchestrator loads it
            from the SQLite CRM, fans out to gather context, dispatches the
            five sub-agents in parallel via{" "}
            <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">
              Promise.all
            </code>
            , routes the result through approval, hands the bundle to comms,
            and posts a structured summary to a real Slack channel. End-to-end
            wall-clock time is roughly 45–75 seconds.
          </p>
          <p>
            The sub-agents are model-mixed and tightly scoped — each owns one
            domain and produces a Zod-validated JSON output. The orchestrator
            never streams free-text to the UI; it streams structured agent
            events. That distinction is the whole reason a deal-desk operator
            can audit what happened, replay it, or hand-edit the inputs.
          </p>
          <p>
            On hero scenarios the agent outputs are served from a cache for
            deterministic playback. On visitor submissions, every call is live
            against Anthropic&apos;s API. Both paths run through the same
            orchestrator code — the only difference is whether the LLM step
            short-circuits to a recorded result.
          </p>
        </div>
        <MermaidDiagram
          chart={HIGH_LEVEL_FLOW}
          caption="Step 2 (vector + Exa) and Step 3 (Pricing + ASC 606 + Redline) fan out in parallel. Approval and Comms are sequential — Approval needs the three upstream outputs, Comms needs Approval's routing decision."
        />
      </section>

      {/* SECTION 2 — agents */}
      <section id="agents" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          2 · The agents
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">
          Five specialist sub-agents under one orchestrator. Each lives in its
          own file under{" "}
          <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">
            lib/agents/
          </code>{" "}
          with a markdown system prompt at{" "}
          <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">
            lib/prompts/
          </code>
          .
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-secondary text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Model</th>
                <th className="px-3 py-2 text-left">Domain</th>
                <th className="px-3 py-2 text-left">Key inputs</th>
                <th className="px-3 py-2 text-left">Key outputs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              <tr>
                <td className="px-3 py-2 font-medium">Pricing</td>
                <td className="px-3 py-2 font-mono text-[11.5px]">Sonnet 4.6</td>
                <td className="px-3 py-2">Discount math, ramp/credit modeling</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Deal · guardrails · top-3 similar deals
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  Effective discount, margin estimate, 2-3 alternative structures
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">ASC 606</td>
                <td className="px-3 py-2 font-mono text-[11.5px]">Opus 4.7</td>
                <td className="px-3 py-2">Revenue recognition reasoning</td>
                <td className="px-3 py-2 text-muted-foreground">Deal terms · clauses</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Performance obligations, variable-consideration flags, monthly schedule
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Redline</td>
                <td className="px-3 py-2 font-mono text-[11.5px]">Sonnet 4.6</td>
                <td className="px-3 py-2">Non-standard clause detection</td>
                <td className="px-3 py-2 text-muted-foreground">Deal · customer signals</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Flagged clauses with counter + fallback positions
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Approval</td>
                <td className="px-3 py-2 font-mono text-[11.5px]">Haiku 4.5</td>
                <td className="px-3 py-2">Matrix evaluation + chain routing</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Matrix rules · all upstream outputs
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  Required approvers, approval chain, cycle-time estimate
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Comms</td>
                <td className="px-3 py-2 font-mono text-[11.5px]">Sonnet 4.6</td>
                <td className="px-3 py-2">Internal + external drafts</td>
                <td className="px-3 py-2 text-muted-foreground">
                  All upstream outputs · approval chain
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  Slack post, AE email, customer email, approval one-pager
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Why these models.</span>{" "}
          The orchestrator and ASC 606 use{" "}
          <span className="font-medium text-foreground">Opus 4.7</span> — the
          synthesis verdict and the rev-rec reasoning are the two highest-stakes
          outputs and both reward the strongest model. Pricing, Redline, and
          Comms run on{" "}
          <span className="font-medium text-foreground">Sonnet 4.6</span> for a
          balanced cost/quality trade on math, clause analysis, and tone-aware
          drafting. Approval is a deterministic table lookup over the matrix, so{" "}
          <span className="font-medium text-foreground">Haiku 4.5</span> handles
          it at a fraction of the cost.
        </p>
      </section>

      {/* SECTION 3 — data flow */}
      <section id="data-flow" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          3 · Data flow
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">
          Three data sources feed the orchestrator before the first sub-agent
          dispatches: the committed SQLite CRM, the sqlite-vec virtual table of
          deal embeddings, and Exa for public customer signals. A fourth path —
          the cached-output store — replays prerecorded agent results for hero
          scenarios.
        </p>
        <MermaidDiagram
          chart={DATA_FLOW}
          caption="Solid edges are live calls; the dashed edge from cached_outputs is the deterministic-replay path used for the 5 hero scenarios. Visitor submissions never read from cache."
        />
        <div className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-foreground">
          <p>
            <span className="font-medium">Step-by-step.</span> Step 1 is a
            single-row CRM lookup (~20 ms). Step 2 fans out — vector k-NN
            returns in ~80 ms; Exa is the long pole at ~3 s. Step 3 dispatches
            Pricing, ASC 606, and Redline in parallel; ASC 606 is the longest
            agent at ~14 s because the rev-rec schedule is the most-token-heavy
            generation. Step 4 (Approval) takes ~3 s. Step 5 (Comms) is the
            heaviest single agent at ~12 s because it produces five distinct
            text artifacts. Slack post fires immediately on Comms completion
            (~300 ms). Total ~62 s wall-clock for a typical deal.
          </p>
        </div>
      </section>

      {/* SECTION 4 — MCP */}
      <section id="mcp" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          4 · MCP server architecture
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">
          Tools aren&apos;t inlined into the agent code. They&apos;re exposed
          through four internal MCP servers — running in-process inside the
          Next.js app — that the orchestrator and sub-agents call by name. Tool
          names are namespaced{" "}
          <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">
            mcp__&lt;server&gt;__&lt;tool&gt;
          </code>
          .
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-secondary text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">MCP server</th>
                <th className="px-3 py-2 text-left">Tools exposed</th>
                <th className="px-3 py-2 text-left">Used by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              <tr>
                <td className="px-3 py-2 font-mono text-[11.5px]">crm-server</td>
                <td className="px-3 py-2 text-muted-foreground">
                  get_deal · get_pricing_guardrails · get_approval_matrix
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  Orchestrator → Pricing, Approval
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-[11.5px]">vector-server</td>
                <td className="px-3 py-2 text-muted-foreground">
                  find_similar_deals (k-NN, top-3)
                </td>
                <td className="px-3 py-2 text-muted-foreground">Orchestrator</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-[11.5px]">exa-server</td>
                <td className="px-3 py-2 text-muted-foreground">
                  customer_signals (24h cache key)
                </td>
                <td className="px-3 py-2 text-muted-foreground">Orchestrator</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-[11.5px]">slack-server</td>
                <td className="px-3 py-2 text-muted-foreground">post_deal_review (Block Kit)</td>
                <td className="px-3 py-2 text-muted-foreground">Comms (via Orchestrator)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          MCP gives agents a clean tool boundary independent of where they run.
          The same agent code works inside Kiln&apos;s Node runtime, inside
          Claude Desktop, or against a future Clay-MCP integration — only the
          server registration changes. It also means a fork can swap the mock
          CRM for a real Salesforce backend by replacing one server file.
        </p>
      </section>

      {/* SECTION 5 — Worked example */}
      <section id="worked-example" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          5 · Worked example — Anthropic Q1 expansion
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">
          What actually happens when the orchestrator runs on the Anthropic
          hero scenario — a $1.5M TCV strategic expansion with 5 non-standard
          clauses including an MFN. Timestamps are wall-clock from the live run
          captured during build verification.
        </p>
        <ol className="mt-5 space-y-4">
          <TimelineNode
            t="T+0.0s"
            who="Orchestrator"
            title="Load deal from CRM"
            body={
              <>
                <code className="font-mono text-[12px]">
                  mcp__crm__get_deal(&apos;deal_anthropic_2026q1_expansion&apos;)
                </code>{" "}
                → full deal record. $1.5M TCV, 36-month term, 12% headline
                discount, 5 non-standard clauses (MFN, exclusivity, custom
                data residency, rollover credits, termination-for-convenience).
              </>
            }
          />
          <TimelineNode
            t="T+0.1s"
            who="Orchestrator"
            title="Step 2 — gather context (parallel)"
            body={
              <>
                Fan-out to vector k-NN and Exa via <code className="font-mono text-[12px]">Promise.all</code>.
                Vector returns 3 similar deals (a 2025 Anthropic expansion, an
                OpenAI expansion, a Mistral mid-market deal). Exa returns 4
                signals — recent funding, leadership change, new product launch,
                hiring signal. Step joins at <code className="font-mono text-[12px]">~3.2s</code>.
              </>
            }
          />
          <TimelineNode
            t="T+3.3s"
            who="Pricing · ASC 606 · Redline"
            title="Step 3 — dispatch sub-agents (parallel)"
            body={
              <>
                Pricing identifies the headline 12% discount as{" "}
                <span className="font-medium">28.4% effective</span> once the
                ramp and credits are factored in; proposes three alternative
                structures. ASC 606 identifies 4 performance obligations and
                flags the ramp as variable consideration requiring the
                expected-value method. Redline flags 5 clauses with concrete
                counter + fallback positions for each. Step joins at{" "}
                <code className="font-mono text-[12px]">~15s</code> (ASC 606 is the long pole).
              </>
            }
          />
          <TimelineNode
            t="T+15.3s"
            who="Approval"
            title="Step 4 — approval routing"
            body={
              <>
                Matrix evaluation triggers three rules: ACV &gt; $500K → CFO;
                non-standard clause count &gt; 3 → Legal; MFN clause present →
                CEO. Final chain:{" "}
                <span className="font-medium">
                  AE Manager → RevOps → CFO + Legal (parallel) → CEO
                </span>
                . Estimated cycle time: <span className="font-medium">5 business days</span>.
              </>
            }
          />
          <TimelineNode
            t="T+18.4s"
            who="Comms"
            title="Step 5 — communications drafts"
            body={
              <>
                Block Kit Slack post, AE briefing email (collaborative tone,
                walks the AE through the 5 clause counters), customer-facing
                email (collaborative, leads with alternative structures), and
                approval one-pager. All drafts cite the upstream outputs with
                concrete numbers, not paraphrases.
              </>
            }
          />
          <TimelineNode
            t="T+30.5s"
            who="Slack + Artifact generators"
            title="Slack post + 5 downloadable artifacts"
            body={
              <>
                Block Kit message lands in <code className="font-mono text-[12px]">#deal-desk</code> in
                the kiln-demo workspace. Document generators emit{" "}
                <span className="font-medium">redlined-msa.docx</span>,{" "}
                <span className="font-medium">order-form.pdf</span>,{" "}
                <span className="font-medium">approval-one-pager.pdf</span>,{" "}
                <span className="font-medium">ae-email.eml</span>, and a 10-tab{" "}
                <span className="font-medium">deal-summary.xlsx</span> with
                live cross-tab formulas — open it in Excel and edit the
                discount cell to watch the rev-rec schedule recalculate.
              </>
            }
          />
          <TimelineNode
            t="T+~62s"
            who="Orchestrator"
            title="Synthesis verdict"
            body={
              <>
                Four-sentence executive summary citing each sub-agent. Audit
                log row written. Review persisted to{" "}
                <code className="font-mono text-[12px]">deal_reviews</code>.
                UI receives the final SSE event and renders the verdict card
                + agent output cards.
              </>
            }
          />
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/deals/deal_anthropic_2026q1_expansion"
            className={buttonPrimary}
          >
            Run this scenario live
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
          <Link href="/pipeline" className={buttonSecondary}>
            See all 5 hero scenarios
          </Link>
        </div>
      </section>

      {/* SECTION 6 — Caching */}
      <section id="caching" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          6 · Caching strategy
        </h2>
        <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-foreground">
          <p>
            Two paths through the same orchestrator. Hero scenarios serve
            cached output from{" "}
            <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">
              db/seed/cached_outputs/
            </code>{" "}
            so the demo is snappy and deterministic — five recorded JSON files,
            one per hero deal, replayed at SSE-streaming speed so the timeline
            feels live. Visitor submissions trigger a real Anthropic API call
            and run live.
          </p>
          <p>
            The split is deliberate. Hero scenarios optimize for{" "}
            <span className="font-medium">determinism + cost</span> — the
            recruiter sees the same well-tuned output every time, and the demo
            costs nothing to operate. Visitor submissions optimize for{" "}
            <span className="font-medium">authenticity</span> — when somebody
            puts their own deal in, the agents must actually reason about it.
            Approximate cost per live submission: a few cents.
          </p>
          <p>
            Visitor deals live in an in-memory store keyed by a signed session
            cookie (<code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">lib/visitor-submit/store.ts</code>) and never touch the
            committed SQLite file. Other visitors can&apos;t see them, the
            dashboard&apos;s pipeline KPIs ignore them, and they evaporate on
            the next deploy. That isolation is the privacy contract.
          </p>
        </div>
      </section>

      {/* SECTION 7 — Schemas */}
      <section id="schemas" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          7 · Output schemas
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">
          Every agent emits JSON conforming to a Zod schema declared in{" "}
          <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[12px]">
            lib/agents/schemas.ts
          </code>
          . Structured outputs are the reason the UI is renderable, the audit
          log is queryable, and the eval harness can grade runs at all.
        </p>
        <div className="mt-4">
          <SchemaTabs />
        </div>
      </section>

      {/* SECTION 8 — tech surfaces */}
      <section id="stack" className="scroll-mt-6 pt-8">
        <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
          8 · Tech surfaces
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">
          The stack at a glance, for the technical reader who skimmed past the
          diagrams.
        </p>
        <ul className="mt-4 space-y-1.5 text-[13px] text-foreground">
          <StackItem
            label="Streaming"
            body="Server-Sent Events from app/api/run-review/[dealId]/route.ts; one event per agent step."
          />
          <StackItem
            label="Vector search"
            body="sqlite-vec extension on the same SQLite file. k-NN over 1536-dim embeddings."
          />
          <StackItem
            label="Embeddings"
            body="OpenAI text-embedding-3-small. Generated once at seed time; persisted as BLOB on the deal_embeddings virtual table."
          />
          <StackItem
            label="Document generation"
            body="docx for redlined MSA · pdfkit for order form + one-pager · exceljs for the 10-tab live-formula workbook."
          />
          <StackItem
            label="Slack"
            body="@slack/web-api with Block Kit JSON. Bot posts to #deal-desk in a real kiln-demo workspace; invite link surfaces in the sidebar."
          />
          <StackItem
            label="Agent framework"
            body="@anthropic-ai/claude-agent-sdk via query() per agent. Bounded reasoning (effort: low, maxTurns: 2) for predictable latency."
          />
        </ul>
      </section>

      <footer className="mt-12 border-t border-border pt-5 text-[12px] text-muted-foreground">
        Source:{" "}
        <a
          href="https://github.com/fbalenko/kiln"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          github.com/fbalenko/kiln
        </a>
        {" · "}
        Architecture decisions live in{" "}
        <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[11.5px]">
          docs/01-architecture.md
        </code>
        ,{" "}
        <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[11.5px]">
          docs/03-agents.md
        </code>
        , and{" "}
        <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[11.5px]">
          docs/13-clay-integration-plan.md
        </code>
        .
      </footer>
    </div>
  );
}

function TimelineNode({
  t,
  who,
  title,
  body,
}: {
  t: string;
  who: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="relative grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-[120px_1fr]">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {t}
        </span>
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
          {who}
        </span>
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </li>
  );
}

function StackItem({ label, body }: { label: string; body: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-[12px] font-semibold text-foreground">
        {label}
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{body}</span>
    </li>
  );
}
