import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type EntryCardProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  // When true, navigation is a hard <a href> reload. Used for /deals/*
  // routes so the dashboard always opens the full page rather than the
  // slide-over the pipeline view triggers via intercepting routes.
  hardNavigation?: boolean;
};

export function EntryCard({
  href,
  title,
  description,
  icon,
  hardNavigation = false,
}: EntryCardProps) {
  const className = cn(
    "group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 transition",
    "hover:border-foreground/20 hover:bg-surface-hover",
  );

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-md">
          {icon}
        </div>
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
      <div className="mt-1">
        <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </>
  );

  if (hardNavigation) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
