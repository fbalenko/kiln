"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ExternalLink,
  Hash,
  Home as HomeIcon,
  LayoutList,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KILN_DEMO_SLACK_INVITE, KILN_DEMO_SLACK_CHANNEL } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  external?: boolean;
};

type NavSection = {
  // 10.5px uppercase eyebrow; null = no header (rare).
  label: string | null;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home", icon: HomeIcon },
      { href: "/pipeline", label: "Pipeline", icon: LayoutList },
    ],
  },
  {
    label: "More",
    items: [
      {
        href: "https://github.com/fbalenko/kiln",
        label: "GitHub",
        icon: ExternalLink,
        external: true,
      },
    ],
  },
];

// `collapsed` is plumbed for a future thin-rail variant per the redesign
// plan §3.1; AppShell always passes false today.
export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
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
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-border bg-surface-secondary transition-transform duration-200 ease-out md:translate-x-0",
          // Desktop width: 56px collapsed (icon-only rail) | 216px expanded.
          collapsed ? "md:w-[56px]" : "md:w-[216px]",
          open ? "translate-x-0 shadow-xl md:shadow-none" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <SidebarBrand collapsed={collapsed} />
          <button
            type="button"
            aria-label="Close navigation"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-hover hover:text-foreground md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-4">
          {NAV_SECTIONS.map((section, sectionIdx) => (
            <div
              key={section.label ?? `s${sectionIdx}`}
              className={sectionIdx > 0 ? "mt-4" : undefined}
            >
              {section.label && !collapsed ? (
                <div className="mb-1 px-2.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  {section.label}
                </div>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <SidebarFooter collapsed={collapsed} />
      </aside>
    </>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <Link
        href="/"
        aria-label="Kiln home"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background"
      >
        <span className="font-mono text-[12px] font-semibold">K</span>
      </Link>
    );
  }
  return (
    <Link href="/" className="flex flex-col leading-tight">
      <span className="font-mono text-[13px] font-semibold tracking-tight text-foreground">
        Kiln
      </span>
      <span className="mt-0.5 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse"
        />
        Demo Workspace
      </span>
    </Link>
  );
}

function NavLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const isActive = !item.external && isItemActive(pathname, item.href);
  const Icon = item.icon;

  const baseClass = cn(
    "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition",
    isActive
      ? "bg-surface-hover text-foreground"
      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
    collapsed && "justify-center px-0",
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={baseClass}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <ExternalLink
              className="h-3 w-3 text-muted-foreground/70"
              strokeWidth={1.75}
              aria-hidden
            />
          </>
        )}
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      className={baseClass}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
    </Link>
  );
}

// Bottom of the rail: the demo Slack workspace link replaces the prior
// "v0.1 · Phase 2" line. Operators expect Slack adjacency from a deal-
// desk tool.
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <a
        href={KILN_DEMO_SLACK_INVITE}
        target="_blank"
        rel="noreferrer"
        title={`Join #${KILN_DEMO_SLACK_CHANNEL}`}
        className="mx-auto mb-3 mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
      >
        <Hash className="h-3.5 w-3.5" strokeWidth={1.75} />
      </a>
    );
  }
  return (
    <a
      href={KILN_DEMO_SLACK_INVITE}
      target="_blank"
      rel="noreferrer"
      className="group mx-2 mb-3 inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-[11px] text-muted-foreground transition hover:border-border hover:bg-surface-hover hover:text-foreground"
    >
      <Hash
        className="h-3 w-3 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="flex-1 truncate font-mono">
        {KILN_DEMO_SLACK_CHANNEL}
      </span>
      <ExternalLink
        className="h-2.5 w-2.5 text-muted-foreground/70"
        strokeWidth={1.75}
        aria-hidden
      />
    </a>
  );
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
