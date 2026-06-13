/**
 * GlobalSearch — command-palette style fund search.
 *
 * Opens as a blurred glass popup below the header search bar.
 * Results link directly to /fund/$id — no redirect to the explorer.
 * Keyboard: ⌘K to open, ↑↓ to navigate, Enter to open, Escape to close.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search, X, ChevronRight, Loader2, Hash, SlidersHorizontal,
} from "lucide-react";
import { useAMFISchemes, filterActiveSchemes, type AMFIScheme } from "@/lib/live-data";
import { classifyAMFICategory } from "@/lib/categories";

const MAX_RESULTS = 8;

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: schemes, isLoading } = useAMFISchemes();

  const results = useMemo(() => {
    if (!schemes || !query.trim()) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const active = filterActiveSchemes(schemes);
    return active
      .filter((s) => {
        const hay = `${s.schemeName} ${s.amc} ${s.schemeCode}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, MAX_RESULTS);
  }, [schemes, query]);

  const openSearch = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const closeSearch = () => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  };

  const goToFund = (s: AMFIScheme) => {
    navigate({ to: "/fund/$id", params: { id: s.schemeCode } });
    closeSearch();
  };

  // ⌘K global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    };
    document.addEventListener("mousedown", onMouse);
    return () => document.removeEventListener("mousedown", onMouse);
  }, [open]);

  // Body scroll lock when popup open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset activeIdx on result change
  useEffect(() => { setActiveIdx(0); }, [results]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[activeIdx]) goToFund(results[activeIdx]);
    }
  };

  const universeSize = schemes ? filterActiveSchemes(schemes).length : null;

  return (
    <>
      {/* Full-page dimmed backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          aria-hidden="true"
          onClick={closeSearch}
        />
      )}

      <div ref={containerRef} className={`relative ${className ?? ""}`}>
        {/* Search trigger / input */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Open fund search"
          onClick={openSearch}
          onKeyDown={(e) => e.key === "Enter" && openSearch()}
          className={`flex min-w-[180px] cursor-text items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 text-xs transition-all ${
            open
              ? "border-cyan ring-1 ring-cyan/20"
              : "border-border hover:border-border/70"
          }`}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {open ? (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Fund name, AMC or code…"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <span className="flex-1 text-muted-foreground">Search schemes</span>
          )}
          {open && query ? (
            <button
              onClick={(e) => { e.stopPropagation(); setQuery(""); inputRef.current?.focus(); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-border px-1 font-mono text-[10px] text-muted-foreground sm:block">
              ⌘K
            </kbd>
          )}
        </div>

        {/* Popup panel */}
        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[460px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface/95 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">

            {/* Status line */}
            <div className="border-b border-border px-4 py-2">
              {isLoading ? (
                <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading {universeSize?.toLocaleString() ?? "…"} schemes
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {universeSize ? (
                    query
                      ? `${results.length} of ${universeSize.toLocaleString()} schemes match`
                      : `${universeSize.toLocaleString()} active open-ended schemes — type to search`
                  ) : "Loading…"}
                </span>
              )}
            </div>

            {/* Prompt when no query */}
            {!query && !isLoading && (
              <div className="px-4 py-5">
                <p className="mb-3 text-xs text-muted-foreground">
                  Search by fund name, AMC, or scheme code. Results link directly to the fund detail page with full metrics and NAV chart.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Mirae Asset", "HDFC Flexi Cap", "Parag Parikh", "SBI Small Cap"].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-cyan/40 hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {query && !isLoading && results.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No schemes match <span className="text-foreground">"{query}"</span>
                </p>
                <p className="text-xs text-muted-foreground">Try the AMC name, a partial scheme name, or the 6-digit AMFI code.</p>
              </div>
            )}

            {/* Results list */}
            {results.length > 0 && (
              <ul role="listbox" className="py-1" aria-label="Search results">
                {results.map((s, i) => {
                  const cat = classifyAMFICategory(s.category);
                  const isActive = i === activeIdx;
                  return (
                    <li key={s.schemeCode} role="option" aria-selected={isActive}>
                      <button
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                          isActive ? "bg-cyan/[0.08]" : "hover:bg-white/[0.03]"
                        }`}
                        onClick={() => goToFund(s)}
                        onMouseEnter={() => setActiveIdx(i)}
                      >
                        {/* Icon */}
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-background">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                        </div>

                        {/* Text */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-tight text-foreground">
                            {s.schemeName}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {s.amc} &nbsp;·&nbsp; #{s.schemeCode} &nbsp;·&nbsp; ₹{s.nav.toFixed(2)}
                          </p>
                        </div>

                        {/* Category badge + arrow */}
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground sm:block">
                            {cat}
                          </span>
                          <ChevronRight className={`h-4 w-4 transition-colors ${isActive ? "text-cyan" : "text-muted-foreground"}`} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Footer hints */}
            <div className="flex items-center gap-4 border-t border-border px-4 py-2">
              {[
                { keys: ["↑", "↓"], label: "navigate" },
                { keys: ["↵"], label: "open" },
                { keys: ["esc"], label: "close" },
              ].map(({ keys, label }) => (
                <span key={label} className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                  {keys.map((k) => (
                    <kbd key={k} className="rounded border border-border bg-background px-1">{k}</kbd>
                  ))}
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
