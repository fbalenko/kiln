import { ChevronDown, Filter as FilterIcon, ArrowUpDown } from "lucide-react";

// Visual-only toolbar mimicking Clay's table-view chrome. Filter / Sort
// labels show their current ambient state and look interactive but
// don't open menus yet — kept shallow per spec.

export function PipelineToolbar({
  totalDeals,
  totalColumns,
}: {
  totalDeals: number;
  totalColumns: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-secondary px-3 py-1.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        <button
          type="button"
          className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-[12px] font-medium text-foreground transition hover:bg-surface-hover"
        >
          Default View
          <ChevronDown
            className="h-3 w-3 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
        <Separator />
        <span className="whitespace-nowrap text-[12px] text-muted-foreground">
          <span className="font-mono tabular-nums">{totalDeals}</span> Deals
        </span>
        <Separator />
        <span className="whitespace-nowrap text-[12px] text-muted-foreground">
          <span className="font-mono tabular-nums">{totalColumns}</span>{" "}
          Columns
        </span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <ToolbarButton icon={FilterIcon}>
          Stage: <span className="font-medium text-foreground">All</span>
        </ToolbarButton>
        <ToolbarButton icon={ArrowUpDown}>
          Sort:{" "}
          <span className="font-medium text-foreground">
            Display order
          </span>
        </ToolbarButton>
      </div>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden className="hidden h-3.5 w-px bg-border sm:inline-block" />
  );
}

function ToolbarButton({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-transparent px-2 py-1 text-[12px] text-muted-foreground transition hover:border-border hover:bg-surface-hover hover:text-foreground"
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      <span className="hidden sm:inline">{children}</span>
      <ChevronDown
        className="h-3 w-3 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
    </button>
  );
}
