import { Sidebar } from "./sidebar";

// Persistent application chrome: left sidebar only. The previous top
// bar hosted the workspace badge; that identity now lives in the
// sidebar brand, so the top bar is removed and pages can use the full
// vertical space.

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-col md:pl-[216px]">
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
