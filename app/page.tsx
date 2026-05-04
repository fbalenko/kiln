import { EntryCard } from "@/components/dashboard/entry-card";
import { GeometricIcon } from "@/components/dashboard/geometric-icon";
import { SurfacesTable } from "@/components/dashboard/surfaces-table";

export const metadata = {
  title: "Home · Kiln",
  description: "Welcome to the Kiln demo workspace.",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 pb-16 pt-6 sm:pt-10">
      <div className="px-4 sm:px-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-2xl">
          Welcome to Kiln
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          A demo deal-desk co-pilot, built for Clay&rsquo;s Deal Strategy
          &amp; Ops team. Pick an entry point below — or head straight to
          the pipeline to watch the agents work.
        </p>
      </div>

      <section className="mt-7 grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 sm:gap-4 sm:px-6">
        <EntryCard
          href="/deals/deal_anthropic_2026q1_expansion"
          hardNavigation
          title="Run a live agent review"
          description="Watch the Pricing Agent reason through Anthropic&rsquo;s $1.5M strategic expansion — guardrails, margin math, and 2&ndash;3 alternative deal structures stream in field-by-field."
          icon={<GeometricIcon shape="square" color="red" />}
        />
        <EntryCard
          href="/pipeline"
          title="Browse the full deal pipeline"
          description="Five hero scenarios ready for review plus eight historical closed-won deals. Pick any row to open the deal as a slide-over."
          icon={<GeometricIcon shape="triangle" color="blue" />}
        />
      </section>

      <SurfacesTable />
    </div>
  );
}
