import type { DealWithCustomer } from "@/lib/db/queries";
import { DealHeader } from "./deal-header";
import { DealMetadata } from "./deal-metadata";
import { ReviewRunner } from "./review-runner";

// The shared deal-detail body. Rendered by both the full-page route
// (app/deals/[id]/page.tsx) and the slide-over intercepting route
// (app/@modal/(.)deals/[id]/page.tsx) so the two surfaces stay in sync.

export function DealDetail({ deal }: { deal: DealWithCustomer }) {
  return (
    <>
      <DealHeader deal={deal} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-5 sm:px-6 sm:pt-6">
        <DealMetadata deal={deal} />
        <ReviewRunner dealId={deal.id} />
      </div>
    </>
  );
}
