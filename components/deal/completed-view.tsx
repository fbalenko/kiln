"use client";

import { VerdictCard } from "@/components/verdict-card";
import { TimelineSummary } from "./timeline-summary";
import { AgentOutputTabs } from "./agent-output-tabs";
import { SlackPostPanel } from "./slack-post-panel";
import { AuditLogFooter } from "./audit-log-footer";
import { ArtifactsPanel } from "@/components/artifacts-panel";
import { SimilarDealsPanel } from "@/components/panels/similar-deals-panel";
import { CustomerSignalsPanel } from "@/components/panels/customer-signals-panel";
import { deriveRecommendation } from "@/lib/severity";
import type {
  ApprovalOutput,
  Asc606Output,
  CommsOutput,
  PricingOutput,
  RedlineOutput,
} from "@/lib/agents/schemas";
import type { CustomerSignalsResult } from "@/lib/tools/exa-search";
import type { SimilarDealRecord } from "@/lib/tools/vector-search";
import type { SlackPostUiState } from "@/components/slack-post-status";
import type { SlackPostRecord } from "@/lib/tools/slack";

// Mode 2 — fires when the orchestrator emits its synthesis event.
// Per docs/12-redesign-plan.md §3.5, the layout is verdict-first with
// a vertical right-rail of context panels and an 8/4 split for the
// agent tabs. The synthesis paragraph is demoted from a competing
// blue-bordered card to a single inline italic line beneath the verdict
// bar so the verdict stays unambiguously dominant.

interface Props {
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
  comms: CommsOutput;
  synthesis: { summary: string; reviewId: string };
  similarDeals: SimilarDealRecord[] | null;
  customerSignals: CustomerSignalsResult | null;
  slackPost: SlackPostUiState | null;
  // Pre-rendered Mode 1 timeline for the collapsible reasoning trace.
  timeline: React.ReactNode;
  totalElapsedMs: number | null;
  substepCount: number;
  agentCount: number;
  onSlackPostChange?: (next: SlackPostRecord) => void;
}

export function CompletedView({
  pricing,
  asc606,
  redline,
  approval,
  comms,
  synthesis,
  similarDeals,
  customerSignals,
  slackPost,
  timeline,
  totalElapsedMs,
  substepCount,
  agentCount,
  onSlackPostChange,
}: Props) {
  // First sentence of the synthesis is the inline subtitle. The full
  // multi-paragraph summary lives behind the audit-log expansion so
  // the verdict bar stays unambiguously dominant.
  const synthesisLeadSentence = firstSentenceOf(synthesis.summary);
  const recommendation = deriveRecommendation({
    redlinePriority: redline.overall_redline_priority,
    approvalBlockers: approval.blockers_to_address_first?.length ?? 0,
    marginPct: pricing.margin_pct_estimate,
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* 1. Verdict bar — dominant surface */}
      <div className="space-y-2">
        <VerdictCard
          pricing={pricing}
          asc606={asc606}
          redline={redline}
          approval={approval}
        />
        {/* 2. Synthesis demoted to inline italic line */}
        <p className="px-1 text-[12.5px] italic leading-relaxed text-foreground/85">
          <span className="font-mono not-italic font-semibold uppercase tracking-wider text-foreground">
            {recommendation}
          </span>{" "}
          — {synthesisLeadSentence}
        </p>
      </div>

      {/* 3. Tabs (8 cols) + vertical right rail (4 cols) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <AgentOutputTabs
            pricing={pricing}
            asc606={asc606}
            redline={redline}
            approval={approval}
            comms={comms}
            slackPost={slackPost}
            reviewId={synthesis.reviewId}
            onSlackPostChange={onSlackPostChange}
          />
        </div>
        <aside
          aria-label="Context"
          className="lg:col-span-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1"
        >
          <RailScroll>
            <CustomerSignalsPanel result={customerSignals} />
          </RailScroll>
          <RailScroll>
            <SimilarDealsPanel deals={similarDeals} />
          </RailScroll>
          <RailScroll>
            <SlackPostPanel
              comms={comms}
              state={slackPost}
              reviewId={synthesis.reviewId}
              onChange={onSlackPostChange}
            />
          </RailScroll>
        </aside>
      </div>

      {/* 4. Artifacts panel — full-width row */}
      <ArtifactsPanel reviewId={synthesis.reviewId} />

      {/* 5. Audit log + reasoning trace — paired collapsed footer */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TimelineSummary
          totalElapsedMs={totalElapsedMs}
          substepCount={substepCount}
          agentCount={agentCount}
        >
          {timeline}
        </TimelineSummary>
        <AuditLogFooter reviewId={synthesis.reviewId} />
      </div>

      {/* 6. Full synthesis (the rest after the lead sentence) tucked
          below as the executive write-up — present but de-emphasized. */}
      {synthesis.summary.length > synthesisLeadSentence.length && (
        <details className="rounded-md border border-border bg-card text-[12px]">
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition hover:text-foreground">
            Read full synthesis
          </summary>
          <div className="border-t border-border px-3 py-2.5">
            <p className="whitespace-pre-line leading-relaxed text-foreground/90">
              {synthesis.summary}
            </p>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              review {synthesis.reviewId}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

// Right-rail panel wrapper: caps internal height so a long signals
// list doesn't pull the whole rail downward (the prior 3-up rendered
// the panels in side-by-side columns and yanked sibling heights).
function RailScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[360px] overflow-hidden">
      <div className="max-h-[360px] overflow-y-auto">{children}</div>
    </div>
  );
}

// Quick-and-correct first-sentence extractor for the synthesis lead.
// Grabs everything up to the first sentence terminator followed by a
// space or newline, and falls back to the full summary if no
// terminator is found within the first 240 chars.
function firstSentenceOf(s: string): string {
  const trimmed = s.trim();
  // Match terminator + whitespace OR end of paragraph.
  const m = /[.!?](?=\s|$)/.exec(trimmed);
  if (!m) {
    return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
  }
  const end = m.index + 1;
  return trimmed.slice(0, end);
}
