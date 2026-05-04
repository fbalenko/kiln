import Link from "next/link";
import { LayoutList, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  href: string;
  name: string;
  type: "View" | "Deal";
  updated: string;
  hardNavigation?: boolean;
};

const ICONS = {
  View: LayoutList,
  Deal: FileText,
} as const;

const ROWS: Row[] = [
  {
    href: "/pipeline",
    name: "Default Pipeline View",
    type: "View",
    updated: "just now",
  },
  {
    href: "/deals/deal_anthropic_2026q1_expansion",
    name: "Anthropic — 2026 Multi-Year Enterprise Consolidation",
    type: "Deal",
    updated: "today",
    hardNavigation: true,
  },
];

export function SurfacesTable() {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between px-4 sm:px-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Workspaces &amp; views
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {ROWS.length} surfaces
        </span>
      </div>
      <div className="mt-3 border-y border-border">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border bg-surface-secondary px-4 py-2 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground sm:px-6">
          <span>Name</span>
          <span className="hidden sm:block">Type</span>
          <span className="text-right">Updated</span>
        </div>
        <ul>
          {ROWS.map((row, i) => {
            const Icon = ICONS[row.type];
            const className = cn(
              "grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-2.5 text-[13px] transition last:border-b-0 sm:px-6",
              "hover:bg-surface-hover",
              i % 2 === 1 ? "bg-surface-secondary/40" : "",
            );

            const inner = (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <Icon
                    className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="truncate text-foreground">{row.name}</span>
                </div>
                <span className="hidden text-[11.5px] uppercase tracking-wide text-muted-foreground sm:block">
                  {row.type}
                </span>
                <span className="text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {row.updated}
                </span>
              </>
            );

            return (
              <li key={row.href}>
                {row.hardNavigation ? (
                  <a href={row.href} className={className}>
                    {inner}
                  </a>
                ) : (
                  <Link href={row.href} className={className}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
