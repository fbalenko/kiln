export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-mono text-5xl font-medium tracking-tight tabular-nums sm:text-6xl">
          Kiln
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          A multi-agent deal desk co-pilot, built for Clay&apos;s Deal Strategy
          &amp; Ops team.
        </p>
      </div>
    </main>
  );
}
