import { cn } from "@/lib/utils";

// Simple geometric icon tiles for the dashboard entry cards. Friendly
// but restrained — squares, triangles, circles in single solid colors
// against a soft tinted background. Avoids copying Clay's actual
// illustrations while echoing the same restrained-friendly register.

type GeometricIconProps = {
  shape: "square" | "triangle" | "circle";
  color: "red" | "blue" | "green" | "amber" | "violet";
  className?: string;
};

const COLORS: Record<
  GeometricIconProps["color"],
  { tile: string; fill: string }
> = {
  red: { tile: "bg-rose-50", fill: "fill-rose-500" },
  blue: { tile: "bg-blue-50", fill: "fill-blue-500" },
  green: { tile: "bg-emerald-50", fill: "fill-emerald-500" },
  amber: { tile: "bg-amber-50", fill: "fill-amber-500" },
  violet: { tile: "bg-violet-50", fill: "fill-violet-500" },
};

export function GeometricIcon({
  shape,
  color,
  className,
}: GeometricIconProps) {
  const { tile, fill } = COLORS[color];
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md",
        tile,
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={cn("h-5 w-5", fill)}
        aria-hidden="true"
      >
        {shape === "square" ? <rect x="4" y="4" width="16" height="16" rx="2" /> : null}
        {shape === "circle" ? <circle cx="12" cy="12" r="8" /> : null}
        {shape === "triangle" ? (
          <polygon points="12,4 21,20 3,20" />
        ) : null}
      </svg>
    </div>
  );
}
