// Server-side helper that walks db/seed/cached_outputs/*-review.json once
// per dashboard render and produces the aggregate counts the KPI rail
// needs. No fabricated numbers — every Tile 2/3/4 value comes from real
// cached agent output. Tile 1 is computed from listDeals() in the page
// directly; Tile 5 is a locked placeholder with no data dependency.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ApprovalOutput,
  PricingOutput,
  RedlineOutput,
} from "@/lib/agents/schemas";

const CACHED_DIR = join(process.cwd(), "db", "seed", "cached_outputs");

interface CachedReview {
  deal_id: string;
  outputs: {
    approval: ApprovalOutput;
    pricing: PricingOutput;
    redline: RedlineOutput;
  };
}

// Per-deal severity preview surfaced on the pipeline at xl breakpoints.
// Three glyphs: approval depth, margin %, redline priority. The pipeline
// row component consumes this directly.
export interface DealSeverityPreview {
  approverCount: number;
  marginPct: number;
  redlinePriority: RedlineOutput["overall_redline_priority"];
}

export interface CachedRiskSummary {
  // Tile 2: Sum of ACV across deals where the cached output indicates risk
  // (redline blocks OR approval depth ≥ 4). Excludes deals without a
  // cached review — we don't infer "safe" from "missing."
  acvAtRiskCents: number; // ACV stored as a USD number; "Cents" suffix kept
                          // as a misnomer-free reminder these are integers.
  acvAtRiskCount: number;

  // Tile 3: Deals whose cached approval requires CFO sign-off. The schema
  // uses lowercase role keys ("cfo", "ae_manager", …) so the filter
  // matches that, not the display label.
  cfoApprovalCount: number;
  cfoApprovalHeroCount: number;

  // Tile 4: Average expected_cycle_time_business_days across cached
  // reviews. nReviews is the sample size — the tile shows a warn dot
  // when it drops below 5.
  avgCycleDays: number;
  nReviews: number;

  // Set of deal IDs that have a cached review file on disk. Useful for
  // future tiles or to highlight rows in the pipeline.
  reviewedDealIds: Set<string>;

  // Per-deal severity preview, keyed by deal_id, for the pipeline glyph
  // strip. Empty for deals without a cached review.
  severityByDeal: Map<string, DealSeverityPreview>;
}

const EMPTY_SUMMARY: CachedRiskSummary = {
  acvAtRiskCents: 0,
  acvAtRiskCount: 0,
  cfoApprovalCount: 0,
  cfoApprovalHeroCount: 0,
  avgCycleDays: 0,
  nReviews: 0,
  reviewedDealIds: new Set(),
  severityByDeal: new Map(),
};

// Reads every *-review.json file once. The function intentionally takes
// a `dealAcvByid` map and a `heroIds` set rather than re-querying the DB
// itself — the page already calls listDeals(), so we feed those numbers
// in to keep the helper testable and side-effect free past the fs read.
export function getCachedRiskSummary(
  dealAcvById: Map<string, number>,
  heroIds: Set<string>,
): CachedRiskSummary {
  let files: string[];
  try {
    files = readdirSync(CACHED_DIR).filter((f) => f.endsWith("-review.json"));
  } catch {
    // The cached_outputs directory may legitimately not exist on a cold
    // deploy that hasn't been seeded. Empty summary is the right answer.
    return EMPTY_SUMMARY;
  }

  let acvAtRiskCents = 0;
  let acvAtRiskCount = 0;
  let cfoApprovalCount = 0;
  let cfoApprovalHeroCount = 0;
  let cycleSum = 0;
  let nReviews = 0;
  const reviewedDealIds = new Set<string>();
  const severityByDeal = new Map<string, DealSeverityPreview>();

  for (const file of files) {
    let parsed: CachedReview;
    try {
      const raw = readFileSync(join(CACHED_DIR, file), "utf-8");
      parsed = JSON.parse(raw) as CachedReview;
    } catch {
      // A malformed JSON shouldn't 500 the dashboard — skip and move on.
      continue;
    }

    const dealId = parsed.deal_id;
    const acv = dealAcvById.get(dealId) ?? 0;
    reviewedDealIds.add(dealId);
    nReviews++;

    const approval = parsed.outputs?.approval;
    const pricing = parsed.outputs?.pricing;
    const redline = parsed.outputs?.redline;
    if (!approval || !redline) continue;

    cycleSum += approval.expected_cycle_time_business_days ?? 0;

    const approverCount = approval.required_approvers?.length ?? 0;
    const isBlock = redline.overall_redline_priority === "block";
    if (isBlock || approverCount >= 4) {
      acvAtRiskCents += acv;
      acvAtRiskCount++;
    }

    const requiresCfo = (approval.required_approvers ?? []).some(
      (a) => a.role === "cfo",
    );
    if (requiresCfo) {
      cfoApprovalCount++;
      if (heroIds.has(dealId)) cfoApprovalHeroCount++;
    }

    if (pricing) {
      severityByDeal.set(dealId, {
        approverCount,
        marginPct: pricing.margin_pct_estimate,
        redlinePriority: redline.overall_redline_priority,
      });
    }
  }

  return {
    acvAtRiskCents,
    acvAtRiskCount,
    cfoApprovalCount,
    cfoApprovalHeroCount,
    avgCycleDays: nReviews > 0 ? cycleSum / nReviews : 0,
    nReviews,
    reviewedDealIds,
    severityByDeal,
  };
}
