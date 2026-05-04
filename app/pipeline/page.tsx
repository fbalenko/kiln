import { listDeals } from "@/lib/db/queries";
import { PipelineSection } from "@/components/pipeline/pipeline-section";
import { PipelineToolbar } from "@/components/pipeline/pipeline-toolbar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pipeline · Kiln",
  description: "Active and closed deals in the demo pipeline.",
};

export default function PipelinePage() {
  const deals = listDeals();
  const heroes = deals
    .filter((d) => d.is_scenario === 1)
    .sort(
      (a, b) =>
        (a.scenario_meta?.display_order ?? 99) -
        (b.scenario_meta?.display_order ?? 99),
    );
  const closedWon = deals
    .filter((d) => d.stage === "closed_won")
    .slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 pb-16 pt-6 sm:pt-8">
      <div className="px-4 sm:px-6">
        <h1 className="text-base font-semibold text-foreground">
          Deal pipeline
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          A multi-agent deal desk co-pilot, built for Clay&rsquo;s Deal
          Strategy &amp; Ops team. Pick a scenario to watch the agents
          review it.
        </p>
      </div>
      <div className="mt-5">
        <PipelineToolbar totalDeals={deals.length} totalColumns={11} />
      </div>
      <PipelineSection
        title="Hero scenarios"
        subtitle={`${heroes.length} ready for review`}
        deals={heroes}
        startIndex={1}
      />
      <PipelineSection
        title="Past deals (closed-won)"
        subtitle={`${closedWon.length} historical · institutional memory`}
        deals={closedWon}
        startIndex={heroes.length + 1}
        muted
      />
    </div>
  );
}
