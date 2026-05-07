import Link from "next/link";
import { ExternalLink, MessageSquare, Sparkles } from "lucide-react";
import type { ActivityEntry } from "@/lib/dashboard/activity-feed";

// Vertical list of the last N events from deal_reviews. Each row is a
// 28px-tall mono timestamp + agent dot + verb-phrase. If no reviews
// have been persisted (cold deploy, cache replay only), the panel
// renders an empty state with a "Run your first review" CTA.

export function ActivityFeed({
  entries,
}: {
  entries: ActivityEntry[];
}) {
  return (
    <section
      aria-label="Recent activity"
      className="rounded-md border border-border bg-card"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="text-[12px] font-semibold text-foreground">
          Recent activity
        </h2>
        {entries.length > 0 ? (
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            last {entries.length}
          </span>
        ) : null}
      </header>
      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <ul>
          {entries.map((e, i) => (
            <li key={`${e.kind}-${e.ts}-${i}`}>
              <Row entry={e} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ entry }: { entry: ActivityEntry }) {
  const Icon = entry.kind === "synthesis" ? Sparkles : MessageSquare;
  const verb =
    entry.kind === "synthesis"
      ? "Synthesis · "
      : "Slack post · ";
  const dotColor =
    entry.kind === "synthesis"
      ? "bg-neutral-400"
      : "bg-[var(--brand)]";

  return (
    <Link
      href={`/deals/${entry.dealId}`}
      className="grid grid-cols-[64px_auto_1fr_auto] items-center gap-2.5 border-t border-border px-3 py-1.5 text-[12px] transition first:border-t-0 hover:bg-surface-hover"
    >
      <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {formatRelativeTime(entry.ts)}
      </span>
      <span aria-hidden className="inline-flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`}
        />
        <Icon className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 truncate text-foreground">
        <span className="text-muted-foreground">{verb}</span>
        {entry.customerName} —{" "}
        <span className="text-muted-foreground">{entry.dealName}</span>
      </span>
      {entry.slackPermalink ? (
        <a
          href={entry.slackPermalink}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          open
          <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.75} />
        </a>
      ) : (
        <span aria-hidden />
      )}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-2 px-3 py-4 sm:px-3.5 sm:py-5">
      <p className="text-[12px] text-muted-foreground">
        No reviews persisted yet. Cache replays don&rsquo;t write to the
        activity log.
      </p>
      <a
        href="/deals/deal_anthropic_2026q1_expansion"
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--brand)] px-2.5 text-[11.5px] font-medium text-white transition hover:bg-[var(--brand)]/90"
      >
        Run your first review
      </a>
    </div>
  );
}

// Tight relative-time formatter — produces "now", "2m", "3h", "2d", or
// the locale date for older entries. Mono caption alignment makes "2h"
// and "13m" line up on the left edge.
function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso.slice(0, 10);
  const deltaMs = Date.now() - t;
  const m = Math.round(deltaMs / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
