"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Slide-over panel for intercepted deal navigations from the pipeline
// (and the dashboard, when not using hardNavigation). Closes on X
// button, ESC key, click on the dimmed scrim, or browser back.
// Mobile fills the full viewport (no scrim); sm+ leaves a 10% dimmed
// strip on the left exposing the underlying pipeline.

export function SlideOverShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [router]);

  const close = () => router.back();

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Deal review"
    >
      <button
        type="button"
        aria-label="Close deal panel"
        className="hidden w-[10%] min-w-[60px] bg-foreground/15 transition hover:bg-foreground/25 sm:block"
        onClick={close}
      />
      <div className="flex h-full flex-1 flex-col bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-2 sm:px-5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Deal review
          </span>
          <button
            type="button"
            aria-label="Close deal panel"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
            onClick={close}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
