import type { DealWithCustomer } from "@/lib/db/queries";
import { DemoDataBanner } from "@/components/demo-data-banner";
import { DealHeader } from "./deal-header";
import { DealWorkspace } from "./deal-workspace";

// Shared deal-detail body. Rendered by both the full-page route and
// the slide-over intercepting route so the two surfaces stay in sync.
//
// The Mode 1 workbench layout (deal context rail + reasoning timeline)
// lives inside <DealWorkspace>. <DealHeader> + <DemoDataBanner> stay
// outside so they remain sticky / above the fold.
//
// `autoStart` skips the "Run review" button and enters the live-stream
// state on first paint. Used for visitor-submitted deals so the URL
// the visitor lands on starts running the orchestrator immediately.

export function DealDetail({
  deal,
  isVisitorSubmitted = false,
  autoStart = false,
}: {
  deal: DealWithCustomer;
  isVisitorSubmitted?: boolean;
  autoStart?: boolean;
}) {
  return (
    <>
      <DealHeader deal={deal} />
      <DemoDataBanner
        customer={deal.customer}
        isVisitorSubmitted={isVisitorSubmitted}
      />
      <DealWorkspace deal={deal} autoStart={autoStart} />
    </>
  );
}
