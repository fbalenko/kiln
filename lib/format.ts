export function formatACV(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(2)}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function formatTerm(months: number): string {
  if (months === 0) return "—";
  if (months % 12 === 0) {
    const yrs = months / 12;
    return yrs === 1 ? "1 yr" : `${yrs} yrs`;
  }
  return `${months} mo`;
}

export function formatSegment(segment: string): string {
  switch (segment) {
    case "enterprise":
      return "Enterprise";
    case "mid_market":
      return "Mid-market";
    case "plg_self_serve":
      return "PLG / Self-serve";
    default:
      return segment;
  }
}

export function formatDealType(deal_type: string): string {
  switch (deal_type) {
    case "new_logo":
      return "New logo";
    case "expansion":
      return "Expansion";
    case "renewal":
      return "Renewal";
    case "partnership":
      return "Partnership";
    default:
      return deal_type;
  }
}
