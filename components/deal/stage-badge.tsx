import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_STYLES: Record<string, string> = {
  review: "border-brand/30 bg-brand/10 text-brand",
  negotiation: "border-warning/30 bg-warning/10 text-warning",
  proposal: "border-border bg-secondary text-foreground",
  discovery: "border-border bg-secondary text-muted-foreground",
  // Closed-won uses brand-blue with a check icon per the Clay restyle.
  closed_won: "border-brand/30 bg-brand/10 text-brand",
  closed_lost: "border-border bg-secondary text-muted-foreground",
};

const STAGE_LABELS: Record<string, string> = {
  review: "Review",
  negotiation: "Negotiation",
  proposal: "Proposal",
  discovery: "Discovery",
  closed_won: "Won",
  closed_lost: "Closed-lost",
};

export function StageBadge({
  stage,
  className,
}: {
  stage: string;
  className?: string;
}) {
  const showCheck = stage === "closed_won";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide",
        STAGE_STYLES[stage] ?? STAGE_STYLES.proposal,
        className,
      )}
    >
      {showCheck ? (
        <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
      ) : null}
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
