import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  medium: "border-border bg-secondary text-muted-foreground",
  high: "border-warning/30 bg-warning/10 text-warning",
  expert: "border-clay/30 bg-clay/10 text-clay",
};

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide",
        STYLES[difficulty] ?? STYLES.medium,
        className,
      )}
    >
      {difficulty}
    </span>
  );
}
