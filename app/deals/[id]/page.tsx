import { notFound } from "next/navigation";
import { getDealById } from "@/lib/db/queries";
import { DealHeader } from "@/components/deal/deal-header";
import { DealMetadata } from "@/components/deal/deal-metadata";
import { TimelinePlaceholder } from "@/components/deal/timeline-placeholder";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const deal = getDealById(id);
  if (!deal) return { title: "Deal not found · Kiln" };
  return {
    title: `${deal.customer.name} — ${deal.name} · Kiln`,
  };
}

export default async function DealPage({ params }: Props) {
  const { id } = await params;
  const deal = getDealById(id);
  if (!deal) notFound();

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
