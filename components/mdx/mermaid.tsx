"use client";

import { Maximize2, X } from "lucide-react";
import { useTheme } from "next-themes";
import { use, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(
  key: string,
  setPromise: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const [isZoomed, setIsZoomed] = useState(false);
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(
    cachePromise("mermaid", () => import("mermaid")),
  );

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    fontFamily: "inherit",
    themeCSS: "margin: 1.5rem auto 0;",
    theme: resolvedTheme === "dark" ? "dark" : "default",
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () => {
      return mermaid.render(id, chart.replaceAll("\\n", "\n"));
    }),
  );

  useEffect(() => {
    if (!isZoomed) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsZoomed(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isZoomed]);

  return (
    <>
      <button
        type="button"
        className={cn(
          "group not-prose relative my-4 block w-full cursor-zoom-in overflow-x-auto rounded-lg border border-fd-border/70 bg-fd-card/40 p-3 text-left transition-colors hover:bg-fd-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
          "[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full",
        )}
        onClick={() => setIsZoomed(true)}
        aria-label="Zoom Mermaid diagram"
      >
        <div
          ref={(container) => {
            if (container) bindFunctions?.(container);
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-background/90 px-2 py-1 text-[11px] font-medium text-fd-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="size-3" />
          Zoom
        </span>
      </button>

      {isZoomed ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed Mermaid diagram"
          className="fixed inset-0 z-[80] bg-fd-background/95 backdrop-blur-sm"
          onClick={() => setIsZoomed(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-[81] inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-card px-2.5 py-1.5 text-xs font-medium text-fd-foreground hover:bg-fd-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
            onClick={() => setIsZoomed(false)}
            aria-label="Close zoomed Mermaid diagram"
          >
            <X className="size-3.5" />
            Close
          </button>
          <div className="h-full w-full overflow-auto p-4 pt-16 md:p-8 md:pt-20">
            <div
              className="mx-auto w-fit min-w-full cursor-default [&_svg]:h-auto [&_svg]:max-w-none"
              onClick={(event) => event.stopPropagation()}
            >
              <div dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
