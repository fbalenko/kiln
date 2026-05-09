import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDealById } from "@/lib/db/queries";
import { getLatestReviewIdForDeal } from "@/lib/db/visitor-deals";
import { DealDetail } from "@/components/deal/deal-detail";
import { buttonPrimary, buttonSecondary } from "@/lib/ui-tokens";

export const dynamic = "force-dynamic";

const VISITOR_PREFIX = "visitor-";
const VISITOR_COOKIE = "kiln_visitor_session";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const deal = getDealById(id);
  if (!deal) {
    if (id.startsWith(VISITOR_PREFIX)) {
      return { title: "Submission expired · Kiln" };
    }
    return { title: "Deal not found · Kiln" };
  }
  return {
    title: `${deal.customer.name} — ${deal.name} · Kiln`,
  };
}

export default async function DealPage({ params }: Props) {
  const { id } = await params;
  const isVisitor = id.startsWith(VISITOR_PREFIX);
  const deal = getDealById(id);

  if (!deal) {
    // On Vercel the visitor deal lives in process memory only; if the
    // function instance recycled between submission and a refresh, the
    // record is gone. Render a friendly expired-state page instead of
    // a generic 404 so the visitor can re-submit.
    if (isVisitor) {
      return <VisitorExpired />;
    }
    notFound();
  }

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
    // Auto-fire the orchestrator on first load (no prior review yet).
    // Refreshes after the run hydrate from the in-memory review store
    // (Vercel) or the deal_reviews row (local).
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

function VisitorExpired() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start px-4 pt-12 pb-12 sm:px-6">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        Visitor session
      </p>
      <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-foreground">
        Your submission has expired
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        Visitor-submitted deals are session-scoped on this deployment —
        held in process memory rather than committed to the seed
        database. The serverless function that ran your review has
        recycled, so the deal is no longer reachable. Submit again to
        watch the orchestrator run on a fresh deal in about 60 seconds.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/submit" className={buttonPrimary}>
          Submit a new deal
        </Link>
        <Link href="/pipeline" className={buttonSecondary}>
          Try a hero scenario instead
        </Link>
      </div>
    </div>
  );
}
