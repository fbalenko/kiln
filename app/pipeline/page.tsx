import { listDeals } from "@/lib/db/queries";
import { getCachedRiskSummary } from "@/lib/dashboard/cached-summary";
import { getLastActivityByDeal } from "@/lib/pipeline/last-activity";
import { PipelineWorkspace } from "@/components/pipeline/pipeline-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pipeline · Kiln",
  description: "Active and closed deals in the demo pipeline.",
};

export default function PipelinePage() {
  const deals = listDeals();

  // Per-deal last-activity (latest deal_reviews.ran_at). Used for both
  // the column display and the "Last activity" sort.
  const lastActivityMap = getLastActivityByDeal();
  const lastActivityByDealId: Record<string, string | null> = {};
  for (const d of deals) {
    lastActivityByDealId[d.id] = lastActivityMap.get(d.id) ?? null;
  }

  // Per-deal severity preview (3-glyph strip at xl). Same helper the
  // dashboard already uses; we ignore the aggregate counts here.
  const heroIds = new Set(deals.filter((d) => d.is_scenario === 1).map((d) => d.id));
  const dealAcvById = new Map(deals.map((d) => [d.id, d.acv]));
  const summary = getCachedRiskSummary(dealAcvById, heroIds);
  const severityByDealId: Record<string, ReturnType<typeof summary.severityByDeal.get>> = {};
  for (const [id, sev] of summary.severityByDeal.entries()) {
    severityByDealId[id] = sev;
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-0 pt-5 pb-10 sm:pt-6">
      <div className="flex items-end justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Deal pipeline
          </h1>
          <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
            Active and closed deals in the demo workspace. Filter by stage,
            search by name, or click any row to open the deal review.
          </p>
        </div>
        <a
          href="/submit"
          className="hidden shrink-0 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 h-8 text-[12.5px] font-medium text-white transition hover:bg-[var(--brand)]/90 sm:inline-flex"
        >
          Submit a deal
        </a>
      </div>
      <div className="mt-4">
        <PipelineWorkspace
          deals={deals}
          lastActivityByDealId={lastActivityByDealId}
          severityByDealId={severityByDealId}
        />
      </div>
    </div>
  );
}
