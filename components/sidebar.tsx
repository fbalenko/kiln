"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ExternalLink,
  Home as HomeIcon,
  LayoutList,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  external?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/pipeline", label: "Pipeline", icon: LayoutList },
  {
    href: "https://github.com/fbalenko/kiln",
    label: "GitHub",
    icon: ExternalLink,
    external: true,
  },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close mobile drawer on route change
  useEffect(() => setOpen(false), [pathname]);

  // ESC to close mobile drawer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Mobile hamburger — visible below md only */}
      <button
        type="button"
        aria-label="Open navigation"
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:bg-surface-hover md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {/* Backdrop for mobile drawer */}
      {open ? (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-foreground/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-border bg-surface-secondary transition-transform duration-200 ease-out md:w-[200px] md:translate-x-0",
          open ? "translate-x-0 shadow-xl md:shadow-none" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <SidebarBrand />
          <button
            type="button"
            aria-label="Close navigation"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-hover hover:text-foreground md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex-1 px-2 py-1">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border px-4 py-3 text-[10.5px] text-muted-foreground">
          v0.1 · Phase 2
        </div>
      </aside>
    </>
  );
}

function SidebarBrand() {
  return (
    <Link href="/" className="flex flex-col leading-tight">
      <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
        Kiln
      </span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">
        where clay gets fired into final form
      </span>
    </Link>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = !item.external && isItemActive(pathname, item.href);
  const Icon = item.icon;

  const baseClass = cn(
    "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition",
    isActive
      ? "bg-surface-hover text-foreground"
      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={baseClass}
      >
        <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate">{item.label}</span>
        <ExternalLink
          className="h-3 w-3 text-muted-foreground/70"
          strokeWidth={1.75}
          aria-hidden
        />
      </a>
    );
  }

  return (
    <Link href={item.href} className={baseClass}>
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
