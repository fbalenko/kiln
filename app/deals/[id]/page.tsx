import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDealById } from "@/lib/db/queries";
import { getLatestReviewIdForDeal } from "@/lib/db/visitor-deals";
import { DealDetail } from "@/components/deal/deal-detail";

export const dynamic = "force-dynamic";

const VISITOR_PREFIX = "visitor-";
const VISITOR_COOKIE = "kiln_visitor_session";

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

  const isVisitor = id.startsWith(VISITOR_PREFIX);
  let autoStart = false;

  if (isVisitor) {
    // Cookie ownership check: only the submitter sees their visitor
    // deal. A wrong/missing cookie redirects to /submit so the visitor
    // can re-submit (cookies are HttpOnly so the only way to "log in"
    // is a fresh submission).
    const cookieJar = await cookies();
    const sessionId = cookieJar.get(VISITOR_COOKIE)?.value;
    const expectedSessionId = id.slice(VISITOR_PREFIX.length);
    if (!sessionId || sessionId !== expectedSessionId) {
      redirect("/submit");
    }
    // Auto-fire the orchestrator on first load (no prior review row).
    // Refreshes after the run land via the visitor in-memory cache or
    // — if the process restarted — via the existing deal_reviews row,
    // which the orchestrator's auto-fire path resolves transparently.
    const priorReviewId = getLatestReviewIdForDeal(id);
    autoStart = priorReviewId === null;
  }

  return (
    <DealDetail
      deal={deal}
      isVisitorSubmitted={isVisitor}
      autoStart={autoStart}
    />
  );
}
