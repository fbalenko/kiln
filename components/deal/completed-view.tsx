"use client";

import { Check } from "lucide-react";
import { VerdictCard } from "@/components/verdict-card";
import { TimelineSummary } from "./timeline-summary";
import { AgentOutputTabs } from "./agent-output-tabs";
import { SlackPostPanel } from "./slack-post-panel";
import { AuditLogFooter } from "./audit-log-footer";
import { ArtifactsPanel } from "@/components/artifacts-panel";
import { SimilarDealsPanel } from "@/components/panels/similar-deals-panel";
import { CustomerSignalsPanel } from "@/components/panels/customer-signals-panel";
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

// The Mode 2 layout — fires when the orchestrator emits its synthesis
// event. Top-down: verdict → synthesis → collapsed timeline → tabs →
// 3-up panels → artifacts → audit log footer.

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
  // Pre-rendered timeline for the collapsible "View reasoning trace" section.
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
  return (
    <div className="space-y-7 sm:space-y-8 animate-in fade-in duration-300">
      {/* 1. Verdict */}
      <VerdictCard
        pricing={pricing}
        asc606={asc606}
        redline={redline}
        approval={approval}
      />

      {/* 2. Synthesis paragraph — promoted */}
      <section className="rounded-md border-2 border-[var(--brand)]/40 bg-[var(--brand)]/[0.04] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-white"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--brand)]">
            Executive synthesis
          </div>
        </div>
        <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-foreground">
          {synthesis.summary}
        </p>
        <div className="mt-3 font-mono text-[10px] text-muted-foreground">
          review {synthesis.reviewId}
        </div>
      </section>

      {/* 3. Collapsed reasoning timeline */}
      <TimelineSummary
        totalElapsedMs={totalElapsedMs}
        substepCount={substepCount}
        agentCount={agentCount}
      >
        {timeline}
      </TimelineSummary>

      {/* 4. Tabbed agent outputs */}
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

      {/* 5. Three-up context panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SimilarDealsPanel deals={similarDeals} />
        <CustomerSignalsPanel result={customerSignals} />
        <SlackPostPanel
          comms={comms}
          state={slackPost}
          reviewId={synthesis.reviewId}
          onChange={onSlackPostChange}
        />
      </div>

      {/* 6. Artifacts panel — same component, more breathing room
          via the parent's vertical rhythm and the panel's own padding. */}
      <ArtifactsPanel reviewId={synthesis.reviewId} />

      {/* 7. Audit log footer */}
      <AuditLogFooter reviewId={synthesis.reviewId} />
    </div>
  );
}
