// Per-agent identity colors. Used as 2px left-border accents on timeline
// cards (Mode 1) and as tab-underline indicators (Mode 2). Never as
// background fills — color is information, not decoration.
//
// The five colors are deliberately spread across the spectrum so the
// reasoning-trace timeline reads as five distinct lanes when scanned.

import type { ParentName } from "@/components/reasoning-stream";

export interface AgentIdentity {
  // Hex used in inline style (for arbitrary border-color in Tailwind).
  hex: string;
  // Tailwind classname for the agent's text/underline.
  text: string;
  // Tailwind classname for a subtle bg tint (10% opacity).
  bgTint: string;
  shortLabel: string;
}

export const AGENT_IDENTITY: Record<ParentName, AgentIdentity> = {
  Orchestrator: {
    hex: "#737373",
    text: "text-neutral-600 dark:text-neutral-400",
    bgTint: "bg-neutral-500/[0.06]",
    shortLabel: "Orchestrator",
  },
  "Pricing Agent": {
    hex: "#3B82F6",
    text: "text-blue-600 dark:text-blue-400",
    bgTint: "bg-blue-500/[0.06]",
    shortLabel: "Pricing",
  },
  "ASC 606 Agent": {
    hex: "#8B5CF6",
    text: "text-violet-600 dark:text-violet-400",
    bgTint: "bg-violet-500/[0.06]",
    shortLabel: "ASC 606",
  },
  "Redline Agent": {
    hex: "#F97316",
    text: "text-orange-600 dark:text-orange-400",
    bgTint: "bg-orange-500/[0.06]",
    shortLabel: "Redline",
  },
  "Approval Agent": {
    hex: "#10B981",
    text: "text-emerald-600 dark:text-emerald-400",
    bgTint: "bg-emerald-500/[0.06]",
    shortLabel: "Approval",
  },
  "Comms Agent": {
    hex: "#14B8A6",
    text: "text-teal-600 dark:text-teal-400",
    bgTint: "bg-teal-500/[0.06]",
    shortLabel: "Comms",
  },
};
