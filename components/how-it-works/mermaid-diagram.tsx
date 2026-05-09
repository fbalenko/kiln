"use client";

import { useEffect, useId, useRef, useState } from "react";

// Lazy-loaded Mermaid renderer. The diagram source ships in the
// initial HTML as a <pre> fallback so reader-mode tools and any client
// that disables JS still see the structure. Once mermaid is loaded on
// the client, the SVG replaces the fallback.

type Props = {
  chart: string;
  caption?: string;
};

export function MermaidDiagram({ chart, caption }: Props) {
  const id = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
          themeVariables: {
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            fontSize: "13px",
            primaryColor: "#fafaf9",
            primaryTextColor: "#0a0a0a",
            primaryBorderColor: "#0a0a0a",
            lineColor: "#737373",
            secondaryColor: "#fff7ed",
            tertiaryColor: "#f5f5f5",
          },
        });
        const { svg: rendered } = await mermaid.render(`m-${id}`, chart);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <figure className="my-6">
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-md border border-border bg-card p-4"
      >
        {svg ? (
          <div
            className="mermaid-rendered flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <pre className="whitespace-pre overflow-x-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
            {errored
              ? `Diagram failed to render. Source:\n\n${chart}`
              : chart.trim()}
          </pre>
        )}
      </div>
      {caption ? (
        <figcaption className="mt-2 text-[12px] text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
