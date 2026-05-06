"use client";

import { Hash } from "lucide-react";
import {
  SlackPostStatus,
  type SlackPostUiState,
} from "@/components/slack-post-status";
import type { SlackPostRecord } from "@/lib/tools/slack";
import type { CommsOutput } from "@/lib/agents/schemas";

// Mode 2 standalone panel for the Slack post status — same status row that
// renders inline inside <CommsCard>, but lifted into the three-up context
// row so it sits beside Similar deals and Customer signals. Keeps a
// preview of the plaintext fallback so the visitor can see what was posted
// without leaving the page.

interface Props {
  comms: CommsOutput;
  state: SlackPostUiState | null;
  reviewId?: string | null;
  onChange?: (next: SlackPostRecord) => void;
}

export function SlackPostPanel({
  comms,
  state,
  reviewId,
  onChange,
}: Props) {
  return (
    <section className="flex h-full flex-col rounded-md border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[13px] font-semibold text-foreground">
            Slack post
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {comms.slack_post.channel_suggestion}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3 sm:px-4">
        {state && (
          <SlackPostStatus
            state={state}
            reviewId={reviewId}
            onRetried={onChange}
          />
        )}
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-surface-secondary p-2.5 text-[11.5px] leading-relaxed text-foreground/85">
          {comms.slack_post.plaintext_fallback}
        </pre>
      </div>
    </section>
  );
}
