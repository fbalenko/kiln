// Single source of truth for the severity coloring across the deal-detail
// page. The same numeric value (e.g., 28% margin) renders with the same
// color whether it appears in the verdict card, an agent card, or a tooltip.

export type Severity = "good" | "neutral" | "warn" | "bad";

export interface SeverityClasses {
  // Big-number text color (used inside the verdict tile).
  text: string;
  // Subtle background tint (10% of the severity color).
  bgTint: string;
  // Border tint for chips/pills.
  border: string;
}

export const SEVERITY_CLASSES: Record<Severity, SeverityClasses> = {
  good: {
    text: "text-emerald-700 dark:text-emerald-400",
    bgTint: "bg-emerald-500/[0.08]",
    border: "border-emerald-300 dark:border-emerald-700",
  },
  neutral: {
    text: "text-foreground",
    bgTint: "bg-muted/50",
    border: "border-border",
  },
  warn: {
    text: "text-amber-700 dark:text-amber-400",
    bgTint: "bg-amber-500/[0.08]",
    border: "border-amber-300 dark:border-amber-700",
  },
  bad: {
    text: "text-red-700 dark:text-red-400",
    bgTint: "bg-red-500/[0.08]",
    border: "border-red-300 dark:border-red-700",
  },
};

// Effective discount %: green <20, amber 20-30, red >30.
export function discountSeverity(pct: number): Severity {
  if (pct <= 0) return "good";
  if (pct < 20) return "good";
  if (pct < 30) return "warn";
  return "bad";
}

// Gross margin %: red <25, amber 25-30, green >30. Inverted from discount.
export function marginSeverity(pct: number): Severity {
  if (pct < 25) return "bad";
  if (pct <= 30) return "warn";
  return "good";
}

// ASC 606 red-flag count: 0 = good, 1-2 = warn, 3+ = bad.
export function asc606FlagSeverity(count: number): Severity {
  if (count === 0) return "good";
  if (count <= 2) return "warn";
  return "bad";
}

// Redline overall priority — string enum mapping.
export function redlinePrioritySeverity(
  priority: "low" | "medium" | "high" | "block",
): Severity {
  if (priority === "low") return "good";
  if (priority === "medium") return "warn";
  return "bad"; // high or block
}

// Approval depth in approver count: 1-2 = good, 3-4 = warn, 5+ = bad.
export function approvalDepthSeverity(approverCount: number): Severity {
  if (approverCount <= 2) return "good";
  if (approverCount <= 4) return "warn";
  return "bad";
}

// Final recommendation. Derived from upstream agent state — the same
// rules each card uses internally, just consolidated.
export type Recommendation = "Approve" | "Counter" | "Escalate" | "Block";

export function recommendationSeverity(rec: Recommendation): Severity {
  if (rec === "Approve") return "good";
  if (rec === "Counter") return "warn";
  return "bad"; // Escalate or Block
}

export function deriveRecommendation(args: {
  redlinePriority: "low" | "medium" | "high" | "block";
  approvalBlockers: number;
  marginPct: number;
}): Recommendation {
  if (args.redlinePriority === "block" || args.approvalBlockers > 0) {
    return "Block";
  }
  if (args.redlinePriority === "high" || args.marginPct < 25) return "Escalate";
  if (args.redlinePriority === "medium") return "Counter";
  return "Approve";
}
