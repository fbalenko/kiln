"use client";

import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Mail, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Five-button download grid for the deal-desk artifacts produced by the Comms
// agent. Resolves the artifact via /api/artifacts/[reviewId]/[type] — when no
// fresh review has run, the visitor's reviewId falls back to the deal id and
// the API serves the cached scenario output.
//
// Layout: 2-col on mobile (the 5th button wraps), 5-col row on ≥sm. Each tile
// shows the artifact name, a short subtitle (file type + estimated size), and
// a download icon. Click triggers an anchor download with Content-Disposition
// driving the filename.

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
}

// File-size estimates derived from the test harness output across all 5
// scenarios. These are display-only — the real size comes from the API.
const TILES: Tile[] = [
  { type: "one-pager",      label: "Approval one-pager", format: "PDF",  approxKb: 4,  icon: FileText },
  { type: "order-form",     label: "Order form",         format: "PDF",  approxKb: 3,  icon: FileSpreadsheet },
  { type: "redlined-msa",   label: "Redlined MSA",       format: "DOCX", approxKb: 15, icon: FileText },
  { type: "ae-email",       label: "AE email",           format: "EML",  approxKb: 3,  icon: Mail },
  { type: "customer-email", label: "Customer email",     format: "EML",  approxKb: 3,  icon: Send },
];

export function ArtifactsPanel({
  reviewId,
}: {
  // Either a real `rev_*` id (post-run) or the deal id (cached fallback).
  reviewId: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3.5 sm:p-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--brand)]">
            Deal-desk artifacts
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Take the agent output to a meeting. Each artifact is generated on
            demand from this review.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TILES.map((tile) => (
          <DownloadTile key={tile.type} tile={tile} reviewId={reviewId} />
        ))}
      </div>
    </div>
  );
}

function DownloadTile({
  tile,
  reviewId,
}: {
  tile: Tile;
  reviewId: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const Icon = tile.icon;

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
      URL.revokeObjectURL(url);
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
      onClick={onClick}
      disabled={state === "loading"}
      className={cn(
        "group relative flex w-full flex-col items-start gap-1.5 rounded-md border border-border bg-background px-3 py-2.5 text-left transition",
        "hover:border-[var(--brand)]/40 hover:bg-surface-hover",
        "disabled:cursor-progress disabled:opacity-70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-[var(--brand)]" />
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
        <div className="truncate text-[12.5px] font-medium text-foreground">
          {tile.label}
        </div>
        <div className="text-[10.5px] text-muted-foreground">
          {state === "error"
            ? "retry?"
            : state === "done"
              ? "saved"
              : `${tile.format} · ~${tile.approxKb}KB`}
        </div>
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
