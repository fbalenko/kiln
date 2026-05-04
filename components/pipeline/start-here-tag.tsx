// Used on the recommended hero scenario row in the pipeline.
// Subtle pulsing dot + "Start here" label per docs/05-ui-ux.md §Tier 1.

export function StartHereTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-clay/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-clay">
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-clay opacity-60"
        />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-clay" />
      </span>
      Start here
    </span>
  );
}
