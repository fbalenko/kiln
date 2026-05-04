import { Sidebar } from "./sidebar";
import { WorkspaceBadge } from "./workspace-badge";

// Persistent application chrome: left sidebar + thin top bar with the
// workspace badge. Wraps every page via app/layout.tsx.

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-col md:pl-[200px]">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-end border-b border-border bg-background pl-14 pr-3 md:pl-4 md:pr-6">
          <WorkspaceBadge />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
