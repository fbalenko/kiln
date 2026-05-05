import type { DealWithCustomer } from "@/lib/db/queries";
import { DemoDataBanner } from "@/components/demo-data-banner";
import { DealHeader } from "./deal-header";
import { DealMetadata } from "./deal-metadata";
import { ReviewRunner } from "./review-runner";

// The shared deal-detail body. Rendered by both the full-page route
// (app/deals/[id]/page.tsx) and the slide-over intercepting route
// (app/@modal/(.)deals/[id]/page.tsx) so the two surfaces stay in sync.
//
// The DemoDataBanner sits between the sticky header and the metadata so the
// visitor sees the disclosure on every load before scrolling. It picks one
// of three copy variants based on:
//   • isVisitorSubmitted (Phase 7 flips this to true for /submit deals)
//   • customer.is_real (real seeded company vs fictional)

export function DealDetail({
  deal,
  isVisitorSubmitted = false,
}: {
  deal: DealWithCustomer;
  isVisitorSubmitted?: boolean;
}) {
  return (
    <>
      <DealHeader deal={deal} />
      <DemoDataBanner
        customer={deal.customer}
        isVisitorSubmitted={isVisitorSubmitted}
      />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-5 sm:px-6 sm:pt-6">
        <DealMetadata deal={deal} />
        <ReviewRunner dealId={deal.id} />
      </div>
    </>
  );
}
