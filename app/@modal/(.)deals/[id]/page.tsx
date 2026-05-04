import { notFound } from "next/navigation";
import { getDealById } from "@/lib/db/queries";
import { DealDetail } from "@/components/deal/deal-detail";
import { SlideOverShell } from "@/components/slide-over-shell";

// Intercepting route: triggered when the user navigates client-side
// from /pipeline (or any other in-app route) to /deals/[id]. Direct
// URL access still hits app/deals/[id]/page.tsx and renders the full
// page. Dashboard cards opt out of the intercept by using <a href>
// hard navigation.

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InterceptedDealPage({ params }: Props) {
  const { id } = await params;
  const deal = getDealById(id);
  if (!deal) notFound();
  return (
    <SlideOverShell>
      <DealDetail deal={deal} />
    </SlideOverShell>
  );
}
