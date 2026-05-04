// Top-right workspace badge — ambient identity slot mimicking
// Clay's user-identity chip in the product UI. Non-interactive.

export function WorkspaceBadge() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-2.5 py-1 text-[11.5px] text-muted-foreground">
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-brand opacity-50"
        />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand" />
      </span>
      <span className="font-medium text-foreground">Demo Mode</span>
      <span className="text-muted-foreground">· Kiln Workspace</span>
    </div>
  );
}
