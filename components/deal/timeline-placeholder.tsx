// The 6-step orchestrator timeline shown before any review has run.
// Mirrors docs/03-agents.md §Orchestrator execution plan.

const STEPS: Array<{ id: string; label: string; note: string }> = [
  {
    id: "context",
    label: "Gather context",
    note: "CRM record, customer signals (Exa), top-3 similar past deals",
  },
  {
    id: "pricing",
    label: "Pricing Agent",
    note: "Effective discount, margin, guardrail evaluation, alternative structures",
  },
  {
    id: "asc606",
    label: "ASC 606 Agent",
    note: "Performance obligations, variable consideration, recognition schedule",
  },
  {
    id: "redline",
    label: "Redline Agent",
    note: "Non-standard clauses, suggested counters, fallback positions",
  },
  {
    id: "approval",
    label: "Approval Agent",
    note: "Required approver path per the active matrix",
  },
  {
    id: "comms",
    label: "Comms Agent",
    note: "Slack post, AE email, customer reply draft",
  },
];

export function TimelinePlaceholder() {
  return (
    <ol className="relative space-y-2.5 border-l border-border pl-6 sm:pl-8">
      {STEPS.map((step, i) => (
        <li key={step.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[26px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background font-mono text-[10px] text-muted-foreground sm:-left-[34px]"
          >
            {i + 1}
          </span>
          <div className="rounded-md border border-border bg-card px-3.5 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {step.label}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pending
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {step.note}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
