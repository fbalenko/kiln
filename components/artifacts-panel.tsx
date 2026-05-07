"use client";

import { useEffect, useState } from "react";
import { Download, FileText, FileSpreadsheet, Mail, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_IDENTITY } from "@/lib/agent-identity";
import { badgeStateBase, badgeStateClasses } from "@/lib/ui-tokens";

// Five-button download grid for the deal-desk artifacts produced by the
// Comms agent. Resolves the artifact via /api/artifacts/[reviewId]/[type]
// — when no fresh review has run, the visitor's reviewId falls back to
// the deal id and the API serves the cached scenario output.
//
// Step 8 polish (plan §3.7):
//   • File-type icons are tinted with the producing agent's identity
//     color (Pricing blue / Redline orange / Comms teal) so the panel
//     reads as "deliverables from agent X."
//   • Each tile renders the artifact's generated-at timestamp from the
//     review (or scenario cache) so the visitor can see when it was
//     produced — fetched once via /api/artifacts/[reviewId]/meta.
//   • A cached / live state badge surfaces whether the artifact came
//     from a fresh run or the cached scenario tape. No fabricated
//     download counts (per resolved open question 3).

import type { ParentName } from "@/components/reasoning-stream";

type UrlArtifactType =
  | "redlined-msa"
  | "order-form"
  | "ae-email"
  | "customer-email"
  | "one-pager";

interface Tile {
  type: UrlArtifactType;
  label: string;
  format: string;
  approxKb: number;
  icon: LucideIcon;
  // Identity color comes from the agent that produced this artifact.
  // The plan tags one-pager + order-form as Pricing, redlined MSA as
  // Redline, AE/customer email as Comms.
  producer: ParentName;
}

// File-size estimates derived from the test harness output across all 5
// scenarios. These are display-only — the real size comes from the API.
const TILES: Tile[] = [
  { type: "one-pager",      label: "Approval one-pager", format: "PDF",  approxKb: 4,  icon: FileText,        producer: "Pricing Agent" },
  { type: "order-form",     label: "Order form",         format: "PDF",  approxKb: 3,  icon: FileSpreadsheet, producer: "Pricing Agent" },
  { type: "redlined-msa",   label: "Redlined MSA",       format: "DOCX", approxKb: 15, icon: FileText,        producer: "Redline Agent" },
  { type: "ae-email",       label: "AE email",           format: "EML",  approxKb: 3,  icon: Mail,            producer: "Comms Agent" },
  { type: "customer-email", label: "Customer email",     format: "EML",  approxKb: 3,  icon: Send,            producer: "Comms Agent" },
];

interface ArtifactMeta {
  source: "live" | "cached";
  generatedAt: string;
}

export function ArtifactsPanel({
  reviewId,
}: {
  // Either a real `rev_*` id (post-run) or the deal id (cached fallback).
  reviewId: string;
}) {
  const [meta, setMeta] = useState<ArtifactMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/artifacts/${reviewId}/meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === "object") {
          setMeta(data as ArtifactMeta);
        }
      })
      .catch(() => {
        // Swallow — the tile gracefully falls back to "format · ~size"
        // with no timestamp/badge. The actual download still works.
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  return (
    <div className="rounded-md border border-border bg-card p-3 sm:p-3.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--brand)]">
            Deal-desk artifacts
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Take the agent output to a meeting. Each artifact is generated
            on demand from this review.
          </p>
        </div>
        {meta ? (
          <span
            className={cn(
              badgeStateBase,
              badgeStateClasses(meta.source === "cached" ? "cached" : "live"),
            )}
            title={`Source: ${meta.source}`}
          >
            {meta.source}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TILES.map((tile) => (
          <DownloadTile
            key={tile.type}
            tile={tile}
            reviewId={reviewId}
            meta={meta}
          />
        ))}
      </div>
    </div>
  );
}

function DownloadTile({
  tile,
  reviewId,
  meta,
}: {
  tile: Tile;
  reviewId: string;
  meta: ArtifactMeta | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const Icon = tile.icon;
  const identity = AGENT_IDENTITY[tile.producer];

  const onClick = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(`/api/artifacts/${reviewId}/${tile.type}`);
      if (!res.ok) throw new Error(`http_${res.status}`);
      const blob = await res.blob();
      const filename = parseFilename(res.headers.get("content-disposition")) ??
        `${tile.type}.${formatExtension(tile.format)}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke past the download tick — Chrome headless can race the
      // synchronous revoke and abort the save mid-stream.
      setTimeout(() => URL.revokeObjectURL(url), 4_000);
      setState("done");
      // Reset the "downloaded" affordance after a beat so a second click
      // doesn't look like it failed.
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  return (
    <button
      type="button"
      data-artifact-tile={tile.type}
      onClick={onClick}
      disabled={state === "loading"}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 rounded-md border border-border bg-background px-2.5 py-2 text-left transition",
        "hover:border-[var(--brand)]/40 hover:bg-surface-hover",
        "disabled:cursor-progress disabled:opacity-70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: identity.hex }}
          aria-hidden
        />
        <Download
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition",
            state === "loading" && "animate-pulse",
            state === "done" && "text-[var(--brand)]",
            state === "error" && "text-destructive",
          )}
        />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-foreground">
          {tile.label}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {state === "error"
            ? "retry?"
            : state === "done"
              ? "saved"
              : `${tile.format} · ~${tile.approxKb}KB`}
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[9.5px] text-muted-foreground/80">
        <span className="font-mono tabular-nums">
          {meta ? formatGeneratedAt(meta.generatedAt) : "—"}
        </span>
        <span
          className="text-[9px] uppercase tracking-wider"
          style={{ color: identity.hex, opacity: 0.7 }}
        >
          {identity.shortLabel}
        </span>
      </div>
    </button>
  );
}

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename="([^"]+)"/.exec(disposition);
  return match ? match[1] : null;
}

function formatExtension(format: string): string {
  return format.toLowerCase();
}

// Generated-at formatter: shows a 12-hour clock for today, "MMM D" for
// older entries. Mono caption alignment makes "9:42 AM" line up with
// "Mar 12" across tiles.
function formatGeneratedAt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const today = new Date();
  const sameDay =
    t.getFullYear() === today.getFullYear() &&
    t.getMonth() === today.getMonth() &&
    t.getDate() === today.getDate();
  if (sameDay) {
    return t.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
