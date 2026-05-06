"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { AGENT_IDENTITY } from "@/lib/agent-identity";
import type { ParentName } from "@/components/reasoning-stream";

// Expandable footer that lazy-loads /api/audit/[reviewId] on first open.
// Phase 7 surface — Phase 8 will deepen each row with input/output JSON
// inspection and a per-row "How did the agent decide this?" link.

interface Entry {
  id: string;
  step_index: number;
  agent_name: string;
  step_label: string;
  duration_ms: number;
  tokens_used: number | null;
  ran_at: string;
}

interface Props {
  reviewId: string;
}

export function AuditLogFooter({ reviewId }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || entries !== null || loading) return;
    setLoading(true);
    fetch(`/api/audit/${reviewId}`)
      .then((r) => r.json())
      .then((d: { entries: Entry[] }) => setEntries(d.entries ?? []))
      .catch(() => setError("Failed to load audit log"))
      .finally(() => setLoading(false));
  }, [open, entries, loading, reviewId]);

  return (
    <section className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-surface-hover"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <ClipboardList className="h-3 w-3" />
          </span>
          <span className="text-[13px] font-medium text-foreground">
            View audit log
          </span>
          {entries && (
            <span className="text-[11px] text-muted-foreground">
              · {entries.length} {entries.length === 1 ? "decision" : "decisions"}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading audit entries…
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-[12px] text-red-700">{error}</div>
          )}
          {!loading && !error && entries !== null && entries.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-muted-foreground">
              No audit log entries persisted for this review (cached scenario
              replay does not write to the audit table).
            </div>
          )}
          {!loading && entries && entries.length > 0 && (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <Row key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ entry }: { entry: Entry }) {
  const identity = AGENT_IDENTITY[entry.agent_name as ParentName] ?? {
    hex: "#737373",
  };
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-[12px]">
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {entry.step_index.toString().padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: identity.hex }}
          />
          <span className="text-[12px] font-medium text-foreground">
            {entry.agent_name}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            · {entry.step_label}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{(entry.duration_ms / 1000).toFixed(1)}s</span>
        {entry.tokens_used !== null && (
          <span>{entry.tokens_used.toLocaleString()} tok</span>
        )}
      </div>
    </li>
  );
}

