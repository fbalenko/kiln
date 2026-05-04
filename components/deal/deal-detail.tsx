import type { DealWithCustomer } from "@/lib/db/queries";
import { DealHeader } from "./deal-header";
import { DealMetadata } from "./deal-metadata";
import { TimelinePlaceholder } from "./timeline-placeholder";
import { Button } from "@/components/ui/button";

// The shared deal-detail body. Rendered by both the full-page route
// (app/deals/[id]/page.tsx) and the slide-over intercepting route
// (app/@modal/(.)deals/[id]/page.tsx) so the two surfaces stay in sync.

export function DealDetail({ deal }: { deal: DealWithCustomer }) {
  return (
    <>
      <DealHeader deal={deal} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-5 sm:px-6 sm:pt-6">
        <DealMetadata deal={deal} />

        <section className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Review</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Six agents will reason in sequence — context, pricing, ASC 606,
                redlines, approvals, and comms.
              </p>
            </div>
            <Button className="sm:w-auto">Run review</Button>
          </div>
          <div className="mt-4">
            <TimelinePlaceholder />
          </div>
        </section>
      </div>
    </>
  );
}
