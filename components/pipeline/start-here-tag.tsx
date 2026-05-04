// Used on the recommended hero scenario row in the pipeline.
// Subtle pulsing dot + "Start here" label per docs/05-ui-ux.md §Tier 1.
// Brand-blue tint (#3B82F6) per the Clay restyle.

export function StartHereTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand">
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60"
        />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand" />
      </span>
      Start here
    </span>
  );
}
