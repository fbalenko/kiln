"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Hash,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KILN_DEMO_SLACK_CHANNEL,
  KILN_DEMO_SLACK_INVITE,
} from "@/lib/constants";
import type { SlackPostRecord } from "@/lib/tools/slack";

// Renders the Slack post status row inside the Comms card.
// States:
//   • pending  — orchestrator is dispatching the post
//   • success  — fresh live post; show permalink
//   • cached   — replay; show permalink to the original message (no re-post)
//   • failed   — post errored; show reason + retry button
//
// Always pairs the status line with a small "Join the demo Slack" CTA so
// the recruiter can land in the workspace and see the message in real time.

export type SlackPostUiState =
  | { phase: "pending" }
  | { phase: "settled"; record: SlackPostRecord };

export function SlackPostStatus({
  state,
  reviewId,
  onRetried,
}: {
  state: SlackPostUiState;
  reviewId?: string | null;
  onRetried?: (record: SlackPostRecord) => void;
}) {
  if (state.phase === "pending") {
    return (
      <Wrapper tone="pending">
        <Glyph icon={Loader2} className="animate-spin" tone="pending" />
        <div className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
          Posting to <ChannelChip /> in the demo workspace…
        </div>
        <JoinCta />
      </Wrapper>
    );
  }

  const r = state.record;
  if (r.status === "success") {
    return (
      <Wrapper tone="success">
        <Glyph icon={CheckCircle2} tone="success" />
        <div className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
          Posted to <ChannelChip /> just now.{" "}
          {r.permalink && (
            <a
              href={r.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-[var(--brand)] hover:underline"
            >
              Open in Slack <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <JoinCta />
      </Wrapper>
    );
  }
  if (r.status === "cached") {
    return (
      <Wrapper tone="cached">
        <Glyph icon={Bookmark} tone="cached" />
        <div className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
          Posted previously to <ChannelChip /> on{" "}
          {formatDate(r.posted_at)}.{" "}
          {r.permalink && (
            <a
              href={r.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-[var(--brand)] hover:underline"
            >
              View original <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <span className="ml-1 text-muted-foreground">
            · cache replay does not re-post
          </span>
        </div>
        <JoinCta />
      </Wrapper>
    );
  }
  if (r.status === "skipped") {
    return (
      <Wrapper tone="cached">
        <Glyph icon={Bookmark} tone="cached" />
        <div className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
          Slack post skipped (no thread captured for this review).
        </div>
        <JoinCta />
      </Wrapper>
    );
  }
  // failed
  return (
    <FailedRow record={r} reviewId={reviewId} onRetried={onRetried} />
  );
}

function FailedRow({
  record,
  reviewId,
  onRetried,
}: {
  record: SlackPostRecord;
  reviewId?: string | null;
  onRetried?: (next: SlackPostRecord) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [overlay, setOverlay] = useState<SlackPostRecord | null>(null);
  const live = overlay ?? record;
  const reasonLabel = friendlyReason(live);

  async function retry() {
    if (!reviewId) return;
    setRetrying(true);
    try {
      const resp = await fetch(`/api/slack-retry/${reviewId}`, {
        method: "POST",
      });
      const next = (await resp.json()) as SlackPostRecord | { error: string };
      if ("status" in next) {
        setOverlay(next);
        onRetried?.(next);
      }
    } finally {
      setRetrying(false);
    }
  }

  if (live.status === "success") {
    // Retry succeeded — re-render as success row
    return <SlackPostStatus state={{ phase: "settled", record: live }} reviewId={reviewId} />;
  }

  return (
    <Wrapper tone="failed">
      <Glyph icon={AlertTriangle} tone="failed" />
      <div className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
        Slack post failed: <span className="font-medium">{reasonLabel}</span>
        {live.error && (
          <span className="ml-1 text-muted-foreground">· {live.error}</span>
        )}
      </div>
      {reviewId && (
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100",
            retrying && "opacity-60",
          )}
        >
          <RefreshCcw
            className={cn("h-3 w-3", retrying && "animate-spin")}
          />
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
      <JoinCta />
    </Wrapper>
  );
}

function friendlyReason(r: SlackPostRecord): string {
  switch (r.reason) {
    case "auth_error":
      return "auth error";
    case "rate_limit":
      return "rate-limited";
    case "channel_not_found":
      return "channel missing";
    case "network_timeout":
      return "network timeout";
    case "missing_config":
      return "config missing";
    case "invalid_blocks":
      return "invalid blocks";
    default:
      return "unknown error";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "an earlier run";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ChannelChip() {
  return (
    <span className="inline-flex items-baseline gap-0.5 rounded-sm bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
      <Hash className="h-2.5 w-2.5 self-center text-muted-foreground" />
      {KILN_DEMO_SLACK_CHANNEL}
    </span>
  );
}

function JoinCta() {
  return (
    <a
      href={KILN_DEMO_SLACK_INVITE}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--brand)]/30 bg-[var(--brand)]/[0.08] px-2 py-1 text-[11px] font-medium text-[var(--brand)] transition hover:bg-[var(--brand)]/[0.14]"
      title="Join the kiln-demo Slack workspace and see deal-review posts arrive in real time."
    >
      Join workspace
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

type Tone = "pending" | "success" | "failed" | "cached";

function Wrapper({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 sm:flex-nowrap",
        tone === "pending" && "border-[var(--brand)]/30 bg-[var(--brand)]/[0.04]",
        tone === "success" && "border-emerald-200 bg-emerald-50",
        tone === "cached" && "border-border bg-surface-secondary",
        tone === "failed" && "border-amber-300 bg-amber-50",
      )}
    >
      {children}
    </div>
  );
}

function Glyph({
  icon: Icon,
  tone,
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
        tone === "pending" && "bg-[var(--brand)]/15 text-[var(--brand)]",
        tone === "success" && "bg-emerald-100 text-emerald-700",
        tone === "cached" && "bg-muted text-muted-foreground",
        tone === "failed" && "bg-amber-100 text-amber-700",
      )}
    >
      <Icon className={cn("h-3 w-3", className)} strokeWidth={2.25} />
    </span>
  );
}
