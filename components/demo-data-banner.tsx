"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/db/queries";

// Page-level demo-data disclosure. Renders below the sticky deal header so
// the visitor sees it before scrolling — the per-panel "Simulated · Demo
// data" badge on CustomerSignalsPanel becomes a confirmation, not the
// primary disclosure.
//
// Three variants:
//   A — real customer (Anthropic, Notion, etc.) with a fabricated deal
//   B — fully fictional customer (Tessera Health, Northbeam, Reverberate)
//   C — visitor-submitted deal (Phase 7); plumbed now so it's ready
//
// Tone is informative, not warning. Light blue strip per spec
// (bg #EFF6FF / text #1E40AF — Tailwind blue-50 / blue-800).

type Variant = "A" | "B" | "C";

interface BannerCopy {
  body: string;
  expanded: string;
}

function bannerCopy(variant: Variant, customerName: string): BannerCopy {
  if (variant === "C") {
    return {
      body:
        "Live submission · This deal was submitted by a visitor. Customer signals come from real Exa lookups when the customer name matches a real company; pricing guardrails and approval matrix are this demo's defaults, not Clay's actual policy.",
      expanded:
        "Submitted deals run through the full agent pipeline live. Pricing recommendations, ASC 606 analysis, redline counters, and approval routing all reflect this demo's seeded guardrails and matrix — not Clay's actual policy. The author has no insider visibility into Clay's real deal desk operations.",
    };
  }
  if (variant === "A") {
    return {
      body:
        "Demo data · This deal is fabricated for demonstration. Real company name + simulated deal structure. Public signals from Exa are real; deal terms, AE quotes, and competitive context are not.",
      expanded:
        "Real company names appear in seeded scenarios because they make the deal structures more recognizable. The author has no insider knowledge of these companies' actual contracts with Clay. All ACV, term, clause language, AE quotes, and competitive context are inferred from public materials and standard usage-based SaaS practice.",
    };
  }
  // Variant B
  return {
    body: `Demo data · ${customerName} is a fictional company in this demo's seed. All deal terms, public signals, and competitive context are simulated to demonstrate the system's reasoning across realistic deal patterns.`,
    expanded:
      "Fictional customers exist alongside real ones to demonstrate the system's reasoning across deal archetypes that don't perfectly match any real Clay customer. The deal narratives reflect real patterns (competitive displacement, renewal at risk, partnership) but the company itself is invented.",
  };
}

function pickVariant(args: {
  isVisitorSubmitted: boolean;
  isReal: boolean;
}): Variant {
  if (args.isVisitorSubmitted) return "C";
  return args.isReal ? "A" : "B";
}

export function DemoDataBanner({
  customer,
  isVisitorSubmitted = false,
}: {
  customer: Pick<Customer, "name" | "is_real">;
  isVisitorSubmitted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const variant = pickVariant({
    isVisitorSubmitted,
    isReal: customer.is_real === 1,
  });
  const copy = bannerCopy(variant, customer.name);

  return (
    <aside
      role="note"
      aria-label="Demo data disclosure"
      className="border-b border-blue-100 bg-[#EFF6FF] text-[#1E40AF]"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1.5 px-4 py-2 sm:px-6 sm:py-2.5">
        <div className="flex items-start gap-2 text-[12px] leading-snug sm:items-center">
          <Info
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0"
            strokeWidth={2.25}
          />
          <p className="min-w-0 flex-1">{copy.body}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-medium uppercase tracking-wider",
              "text-[10px] text-[#1E40AF] transition hover:bg-blue-100",
            )}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Why?
          </button>
        </div>
        {expanded && (
          <div className="ml-[22px] border-l-2 border-blue-200 pl-3 text-[12px] leading-relaxed text-[#1E3A8A] animate-in fade-in slide-in-from-top-1 duration-200">
            {copy.expanded}
          </div>
        )}
      </div>
    </aside>
  );
}
