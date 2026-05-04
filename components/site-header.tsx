import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/pipeline"
          className="font-mono text-base font-medium tracking-tight text-foreground transition hover:text-clay"
        >
          Kiln
        </Link>
        <nav className="flex items-center gap-5 text-xs">
          <a
            href="https://github.com/fbalenko/kiln"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
