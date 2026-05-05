"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Mail, MessageSquare, FileText, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CommsOutput } from "@/lib/agents/schemas";

type Partial = globalThis.Partial<CommsOutput> & { _meta?: AgentMeta };

interface AgentMeta {
  from_cache?: boolean;
  duration_ms?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export function CommsCard({ output }: { output: Partial }) {
  return (
    <div className="space-y-2">
      {output.slack_post && (
        <Artifact
          title="Slack post"
          subtitle={output.slack_post.channel_suggestion}
          icon={MessageSquare}
        >
          <pre className="whitespace-pre-wrap rounded bg-surface-secondary p-2.5 text-xs leading-relaxed text-foreground/85">
            {output.slack_post.plaintext_fallback}
          </pre>
        </Artifact>
      )}

      {output.ae_email_draft && (
        <Artifact
          title="AE email"
          subtitle={`To ${output.ae_email_draft.to} · ${output.ae_email_draft.suggested_send_time}`}
          icon={Mail}
        >
          <div className="text-xs">
            <div className="font-medium text-foreground">
              {output.ae_email_draft.subject}
            </div>
            <pre className="mt-1.5 whitespace-pre-wrap rounded bg-surface-secondary p-2.5 leading-relaxed text-foreground/85">
              {output.ae_email_draft.body_markdown}
            </pre>
          </div>
        </Artifact>
      )}

      {output.customer_email_draft && (
        <Artifact
          title="Customer email"
          subtitle={
            <span className="inline-flex items-center gap-1.5">
              <span>To {output.customer_email_draft.to_role}</span>
              <Badge variant="outline" className="text-[10px]">
                tone: {output.customer_email_draft.tone}
              </Badge>
            </span>
          }
          icon={Send}
        >
          <div className="text-xs">
            <div className="font-medium text-foreground">
              {output.customer_email_draft.subject}
            </div>
            <pre className="mt-1.5 whitespace-pre-wrap rounded bg-surface-secondary p-2.5 leading-relaxed text-foreground/85">
              {output.customer_email_draft.body_markdown}
            </pre>
            {output.customer_email_draft.counter_positions_included &&
              output.customer_email_draft.counter_positions_included.length >
                0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    counters included
                  </span>
                  {output.customer_email_draft.counter_positions_included.map(
                    (c, i) => (
                      <Badge
                        key={`${c}-${i}`}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {c}
                      </Badge>
                    ),
                  )}
                </div>
              )}
          </div>
        </Artifact>
      )}

      {output.approval_review_one_pager && (
        <Artifact
          title="Approval one-pager"
          subtitle={output.approval_review_one_pager.title}
          icon={FileText}
        >
          <ul className="space-y-2 text-xs">
            {output.approval_review_one_pager.sections?.map((s, i) => (
              <li key={`${s.heading}-${i}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                  {s.heading}
                </div>
                <div className="mt-0.5 whitespace-pre-line leading-relaxed text-foreground/85">
                  {s.content_markdown}
                </div>
              </li>
            ))}
          </ul>
        </Artifact>
      )}

      {(output.reasoning_summary || output._meta) && (
        <div className="space-y-2 border-t border-border pt-3 animate-in fade-in duration-300">
          {output.reasoning_summary && (
            <p className="text-[13px] leading-relaxed text-foreground/90">
              {output.reasoning_summary}
            </p>
          )}
          <MetaLine meta={output._meta} />
        </div>
      )}
    </div>
  );
}

function Artifact({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-border bg-background animate-in fade-in slide-in-from-bottom-1 duration-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-hover"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              {title}
            </div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t border-border px-3 py-2.5">{children}</div>}
    </div>
  );
}

function MetaLine({ meta }: { meta?: AgentMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {meta?.from_cache && <span>cached</span>}
      {meta && typeof meta.duration_ms === "number" && (
        <span>{(meta.duration_ms / 1000).toFixed(1)}s</span>
      )}
      {meta &&
        typeof meta.input_tokens === "number" &&
        typeof meta.output_tokens === "number" && (
          <span className={cn()}>
            {meta.input_tokens.toLocaleString()} in /{" "}
            {meta.output_tokens.toLocaleString()} out tok
          </span>
        )}
    </div>
  );
}
