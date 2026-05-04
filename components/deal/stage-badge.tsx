import { cn } from "@/lib/utils";

const STAGE_STYLES: Record<string, string> = {
  review: "border-clay/30 bg-clay/10 text-clay",
  negotiation: "border-warning/30 bg-warning/10 text-warning",
  proposal: "border-border bg-secondary text-foreground",
  discovery: "border-border bg-secondary text-muted-foreground",
  closed_won: "border-success/30 bg-success/10 text-success",
  closed_lost: "border-border bg-secondary text-muted-foreground",
};

const STAGE_LABELS: Record<string, string> = {
  review: "Review",
  negotiation: "Negotiation",
  proposal: "Proposal",
  discovery: "Discovery",
  closed_won: "Closed-won",
  closed_lost: "Closed-lost",
};

export function StageBadge({
  stage,
  className,
}: {
  stage: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide",
        STAGE_STYLES[stage] ?? STAGE_STYLES.proposal,
        className,
      )}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
