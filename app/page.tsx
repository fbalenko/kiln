import { ArrowUpRight, PlusCircle } from "lucide-react";
import { listDeals } from "@/lib/db/queries";
import { getCachedRiskSummary } from "@/lib/dashboard/cached-summary";
import { getRecentActivity } from "@/lib/dashboard/activity-feed";
import { KpiRail } from "@/components/dashboard/kpi-rail";
import { HeroQuickStart } from "@/components/dashboard/hero-quick-start";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { SurfacesTable } from "@/components/dashboard/surfaces-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deal desk · Kiln",
  description: "Pipeline health summary, hero scenarios, and recent activity.",
};

export default function DashboardPage() {
  const deals = listDeals();
  const heroes = deals
    .filter((d) => d.is_scenario === 1)
    .sort(
      (a, b) =>
        (a.scenario_meta?.display_order ?? 99) -
        (b.scenario_meta?.display_order ?? 99),
    );

  // Tile 1: "in review" = not yet won/lost.
  const inReview = deals.filter(
    (d) => d.stage !== "closed_won" && d.stage !== "closed_lost",
  );
  const inReviewHeroCount = inReview.filter((d) => d.is_scenario === 1).length;

  // Feed Tiles 2/3/4 from real cached output. The helper takes plain
  // maps so it stays unit-testable.
  const dealAcvById = new Map(deals.map((d) => [d.id, d.acv]));
  const heroIds = new Set(heroes.map((d) => d.id));
  const summary = getCachedRiskSummary(dealAcvById, heroIds);

  const activity = getRecentActivity(8);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-10 sm:px-6 sm:pt-6">
      <header className="flex items-end justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
            Deal desk overview
          </h1>
          <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
            Pipeline health, hero scenarios, and recent agent activity. Click
            any tile, scenario, or row to dig in.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <a
            href="/pipeline"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-8 text-[12.5px] font-medium text-foreground transition hover:bg-surface-hover"
          >
            Open pipeline
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </a>
          <a
            href="/submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 h-8 text-[12.5px] font-medium text-white transition hover:bg-[var(--brand)]/90"
          >
            <PlusCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Submit a deal
          </a>
        </div>
      </header>

      <KpiRail
        inReviewCount={inReview.length}
        inReviewHeroCount={inReviewHeroCount}
        acvAtRiskCents={summary.acvAtRiskCents}
        acvAtRiskCount={summary.acvAtRiskCount}
        cfoApprovalCount={summary.cfoApprovalCount}
        cfoApprovalHeroCount={summary.cfoApprovalHeroCount}
        cfoApprovalHeroTotal={heroes.length}
        avgCycleDays={summary.avgCycleDays}
        nReviews={summary.nReviews}
      />

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HeroQuickStart heroes={heroes} totalDealCount={deals.length} />
        <ActivityFeed entries={activity} />
      </div>

      {/* Workspaces & views — kept as a sparse footer table per plan. */}
      <SurfacesTable />
    </div>
  );
}
