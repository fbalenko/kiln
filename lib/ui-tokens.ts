// Single source of truth for the redesign-v2 component primitives.
//
// Every refactored component imports its className from here rather than
// inlining Tailwind utilities. This keeps the "operator-feeling" register
// consistent across the app and makes future visual passes a one-file edit.
// Tokens map 1:1 to the table in docs/12-redesign-plan.md §2.4.

// ---- Cards --------------------------------------------------------------

// Base card surface — 1px border, light card bg, 6px radius. The visual
// register the entire app shares. No shadow at rest.
export const cardBase = "rounded-md border border-border bg-card";

// Tighter padding scale (was p-4 sm:p-5; now ~25% denser).
export const cardPadded = "p-3 sm:p-3.5";

// Card header with bottom rule — used on verdict, panels, agent cards.
export const cardHeader =
  "flex items-baseline justify-between gap-3 border-b border-border px-3 py-2";

// Inline section title inside a card body.
export const cardSectionHeader = "text-[12px] font-semibold text-foreground";

// 10.5px uppercase eyebrow used for column labels and small meta lines.
export const cardEyebrow =
  "text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground";

// ---- Buttons ------------------------------------------------------------

// Filled brand-blue CTA. h-8 = 32px so it sits comfortably alongside dense
// table rows without dominating them.
export const buttonPrimary =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white transition hover:bg-[var(--brand)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 disabled:opacity-50 disabled:cursor-not-allowed";

// Bordered secondary button. Same height as primary so they line up.
export const buttonSecondary =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[12.5px] font-medium text-foreground transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 disabled:opacity-50 disabled:cursor-not-allowed";

// Borderless ghost — used for "back to pipeline" links, expand/collapse
// chevrons, low-emphasis footer actions.
export const buttonGhost =
  "inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground transition hover:bg-surface-hover hover:text-foreground";

// Toolbar button (filter pills, sort dropdowns, view selectors) — appears
// borderless until hover, then gains a 1px border to signal interactivity.
export const buttonToolbar =
  "inline-flex h-7 items-center gap-1.5 rounded border border-transparent px-2 text-[12px] text-muted-foreground transition hover:border-border hover:bg-surface-hover hover:text-foreground";

// ---- Inputs -------------------------------------------------------------

export const inputBase =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground transition placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30";

// ---- Badges -------------------------------------------------------------

// Plain outlined chip — neutral metadata.
export const badgeOutline =
  "inline-flex h-5 items-center rounded-sm border border-border bg-card px-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground";

// Severity badges defer to lib/severity.ts for the bg/text/border;
// callers compose these classes with SEVERITY_CLASSES[severity].
export const badgeSeverityBase =
  "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10.5px] font-medium uppercase tracking-wider";

// State badges — additive functional colors for system-state signals
// (cached/live/posted/failed). The colors are defined as CSS vars in
// app/globals.css; the helper below picks the right pair.
export type StateBadgeKind = "cached" | "live" | "posted" | "failed";

export const badgeStateBase =
  "inline-flex h-5 items-center rounded-sm px-1.5 text-[10.5px] font-medium uppercase tracking-wider";

export function badgeStateClasses(kind: StateBadgeKind): string {
  switch (kind) {
    case "cached":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
    case "live":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "posted":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  }
}

// ---- Tables -------------------------------------------------------------

// Standard 32px-min table row. Callers add their own grid-template-columns.
export const tableRow =
  "grid items-center gap-3 px-3 py-1.5 text-[12.5px] hover:bg-surface-hover";

// Denser 28px row for high-density audit lists.
export const tableRowDense =
  "grid items-center gap-2.5 px-3 py-1 text-[12px] hover:bg-surface-hover";

// Sticky table header row — eyebrow type, sits above the body on scroll.
export const tableHeader =
  "grid items-center gap-3 px-3 py-1.5 border-b border-border bg-surface-secondary text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground sticky top-0 z-10";

// Apply on every other row to get the Stripe-style striped read.
export const tableStripedRow = "bg-surface-secondary/40";

// ---- Panels -------------------------------------------------------------

// Right-rail panel container with internal scroll cap so heights don't
// fight each other across siblings.
export const panelRail = "rounded-md border border-border bg-card overflow-hidden";

// Internal-scroll body for a rail panel — caps long content so the
// rail's vertical rhythm holds.
export const panelRailScroll = "max-h-[320px] overflow-y-auto";
