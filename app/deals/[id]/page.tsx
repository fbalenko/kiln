import { notFound } from "next/navigation";
import { getDealById } from "@/lib/db/queries";
import { DealDetail } from "@/components/deal/deal-detail";

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
  return <DealDetail deal={deal} />;
}
