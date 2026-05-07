// Pipeline filter/sort/search state. Per docs/12-redesign-plan.md §3.4
// the shape is a flat record of URL-encodable primitives so the eventual
// URL-sync (resolved open question 4) is a one-useEffect change.

import type { Deal } from "@/lib/db/queries";

export type Stage = Deal["stage"];

export type PipelineView = "default" | "heroes" | "closed_won";

export type PipelineSort =
  | "display_order"
  | "acv_desc"
  | "term_desc"
  | "last_activity_desc";

export interface PipelineFilterState {
  view: PipelineView;
  stages: Stage[];           // empty = no stage filter (all stages)
  sort: PipelineSort;
  search: string;
}

export const DEFAULT_FILTER_STATE: PipelineFilterState = {
  view: "default",
  stages: [],
  sort: "display_order",
  search: "",
};

export const STAGE_VALUES: Stage[] = [
  "discovery",
  "proposal",
  "negotiation",
  "review",
  "closed_won",
  "closed_lost",
];

const STAGE_LABEL: Record<Stage, string> = {
  discovery: "Discovery",
  proposal: "Proposal",
  negotiation: "Negotiation",
  review: "Review",
  closed_won: "Won",
  closed_lost: "Closed-lost",
};

export function stageLabel(stage: Stage): string {
  return STAGE_LABEL[stage] ?? stage;
}

const VIEW_LABEL: Record<PipelineView, string> = {
  default: "Default View",
  heroes: "Hero scenarios",
  closed_won: "Closed-won",
};

export function viewLabel(v: PipelineView): string {
  return VIEW_LABEL[v];
}

const SORT_LABEL: Record<PipelineSort, string> = {
  display_order: "Display order",
  acv_desc: "ACV (desc)",
  term_desc: "Term (desc)",
  last_activity_desc: "Last activity",
};

export function sortLabel(s: PipelineSort): string {
  return SORT_LABEL[s];
}

// URL <-> state. The component reads/writes through these helpers so
// the eventual URL sync is a single useEffect addition, not a refactor.

export function encodeFilterState(s: PipelineFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.view !== "default") p.set("view", s.view);
  if (s.stages.length > 0) p.set("stage", s.stages.join(","));
  if (s.sort !== "display_order") p.set("sort", s.sort);
  if (s.search.trim().length > 0) p.set("q", s.search.trim());
  return p;
}

export function decodeFilterState(p: URLSearchParams): PipelineFilterState {
  const view = p.get("view");
  const stage = p.get("stage");
  const sort = p.get("sort");
  const q = p.get("q") ?? "";
  return {
    view: isView(view) ? view : "default",
    stages: stage
      ? stage
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is Stage =>
            (STAGE_VALUES as readonly string[]).includes(s),
          )
      : [],
    sort: isSort(sort) ? sort : "display_order",
    search: q,
  };
}

function isView(v: string | null): v is PipelineView {
  return v === "default" || v === "heroes" || v === "closed_won";
}
function isSort(v: string | null): v is PipelineSort {
  return (
    v === "display_order" ||
    v === "acv_desc" ||
    v === "term_desc" ||
    v === "last_activity_desc"
  );
}
