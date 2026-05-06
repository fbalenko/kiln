"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AGENT_IDENTITY } from "@/lib/agent-identity";
import type { ParentName } from "@/components/reasoning-stream";
import { AgentOutputCard } from "@/components/agent-output-card";
import { Asc606Card } from "@/components/agent-cards/asc606-card";
import { ApprovalCard } from "@/components/agent-cards/approval-card";
import { CommsCard } from "@/components/agent-cards/comms-card";
import { RedlineCard } from "@/components/agent-cards/redline-card";
import { cn } from "@/lib/utils";
import type {
  ApprovalOutput,
  Asc606Output,
  CommsOutput,
  PricingOutput,
  RedlineOutput,
} from "@/lib/agents/schemas";
import type { SlackPostUiState } from "@/components/slack-post-status";
import type { SlackPostRecord } from "@/lib/tools/slack";

// Mode 2 tabbed surface for the five agent outputs. Each tab uses the
// agent's identity color as its bottom underline indicator (active state
// only) so the active lane is visually consistent with the timeline's
// left-border accents in Mode 1.

interface Props {
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
  comms: CommsOutput;
  defaultTab?: "pricing" | "asc606" | "redline" | "approval" | "comms";
  slackPost?: SlackPostUiState | null;
  reviewId?: string | null;
  onSlackPostChange?: (next: SlackPostRecord) => void;
}

const TAB_TO_AGENT: Record<string, ParentName> = {
  pricing: "Pricing Agent",
  asc606: "ASC 606 Agent",
  redline: "Redline Agent",
  approval: "Approval Agent",
  comms: "Comms Agent",
};

export function AgentOutputTabs({
  pricing,
  asc606,
  redline,
  approval,
  comms,
  defaultTab,
  slackPost,
  reviewId,
  onSlackPostChange,
}: Props) {
  // Pick the highest-severity agent if no explicit default — surface the
  // surface that needs attention first.
  const initial = defaultTab ?? pickInitialTab(redline, asc606, pricing);

  return (
    <Tabs
      defaultValue={initial}
      className="rounded-md border border-border bg-card animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      <div className="border-b border-border px-1.5">
        <TabsList variant="line" className="overflow-x-auto">
          <Trigger value="pricing">Pricing</Trigger>
          <Trigger value="asc606">ASC 606</Trigger>
          <Trigger value="redline">Redline</Trigger>
          <Trigger value="approval">Approval</Trigger>
          <Trigger value="comms">Comms</Trigger>
        </TabsList>
      </div>

      <TabsContent value="pricing" className="p-3 sm:p-4">
        <AgentOutputCard output={pricing} />
      </TabsContent>
      <TabsContent value="asc606" className="p-3 sm:p-4">
        <Asc606Card output={asc606} />
      </TabsContent>
      <TabsContent value="redline" className="p-3 sm:p-4">
        <RedlineCard output={redline} />
      </TabsContent>
      <TabsContent value="approval" className="p-3 sm:p-4">
        <ApprovalCard output={approval} />
      </TabsContent>
      <TabsContent value="comms" className="p-3 sm:p-4">
        <CommsCard
          output={comms}
          slackPost={slackPost}
          reviewId={reviewId}
          onSlackPostChange={onSlackPostChange}
        />
      </TabsContent>
    </Tabs>
  );
}

function Trigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const identity = AGENT_IDENTITY[TAB_TO_AGENT[value]];
  return (
    <TabsTrigger
      value={value}
      // Inline style applies the agent's identity color to the active-state
      // underline (the ::after element from the shared Tabs component).
      style={{ ["--tab-accent" as never]: identity.hex }}
      className={cn(
        "[&[data-active]]:after:!bg-[var(--tab-accent)]",
        "data-active:font-semibold",
      )}
    >
      {children}
    </TabsTrigger>
  );
}

// Heuristic: jump the visitor to the surface that needs the most attention.
// Redline takes precedence (a "block" outranks anything else); falls back to
// ASC 606 if there are red flags; otherwise opens on Pricing.
function pickInitialTab(
  redline: RedlineOutput,
  asc606: Asc606Output,
  pricing: PricingOutput,
): "pricing" | "asc606" | "redline" | "approval" | "comms" {
  if (
    redline.overall_redline_priority === "block" ||
    redline.overall_redline_priority === "high"
  ) {
    return "redline";
  }
  const flagCount = asc606.red_flags?.length ?? 0;
  if (flagCount >= 3) return "asc606";
  if (pricing.margin_pct_estimate < 25) return "pricing";
  return "pricing";
}
