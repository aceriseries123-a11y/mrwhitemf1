import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Search, GitCompare, Briefcase, Filter,
  History, FlaskConical, Trophy, Settings, Activity, Menu, X,
  TrendingUp, TrendingDown, Minus, Bell,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { useMarketTicks, type MarketTick } from "@/lib/market-ticks";
import { GlobalSearch } from "@/components/GlobalSearch";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/explorer", label: "Fund Explorer", icon: Search },
  { to: "/rankings", label: "Rankings", icon: Trophy },
  { to: "/screener", label: "Screener", icon: Filter },
  { to: "/compare", label: "Fund Compare", icon: GitCompare },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/backtest", label: "Backtesting", icon: History },
  { to: "/research-desk", label: "Research Desk", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function TickerItem({ tick }: { tick: MarketTick }) {
  const isPos = tick.chg != null && tick.chg > 0;
  const isNeg = tick.chg != null && tick.chg < 0;
  const chgClass = isPos ? "text-positive" : isNeg ? "text-negative" : "text-muted-foreground";
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 border-r border-border/60 px-3 last:border-r-0">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{tick.label}</span>
      <span className="font-mono text-[11px] font-bold tabular-nums text-foreground">
        {tick.nav != null ? tick.nav.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
      </span>
      {tick.chg != null ? (
        <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-medium tabular-nums ${chgClass}`}>
          <Icon className="h-2.5 w-2.5" />
          {isPos ? "+" : ""}{tick.chg.toFixed(2)}%
        </span>
      ) : (
        <span className="font-mono text-[10px] text-muted-foreground">—</span>
      )}
    </span>
  );
}

function MarketTickerBar() {
  const { data, isError, isLoading } = useMarketTicks();

  if (isLoading) {
    return (
      <div className="flex h-7 items-center border-b border-border bg-surface/40 px-4">
        <span className="animate-pulse font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Loading market data…
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-7 items-center gap-2 border-b border-border bg-surface/40 px-4">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Market data unavailable
        </span>
      </div>
    );
  }

  const asOf = data.find((t) => t.date)?.date;
  const asOfLabel = asOf
    ? new Date(asOf).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
      })
    : null;

  return (
    <div className="no-scrollbar flex h-7 items-center overflow-x-auto border-b border-border bg-surface/40">
      <span className="flex shrink-0 items-center gap-1.5 border-r border-border/60 px-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Markets</span>
      </span>
      {data.map((tick) => <TickerItem key={tick.label} tick={tick} />)}
      {asOfLabel && (
        <span className="ml-auto shrink-0 border-l border-border/60 px-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {asOfLabel} IST
        </span>
      )}
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="min-h-screen bg-background">

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-border bg-surface/95 backdrop-blur-xl transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0`}>

        {/* Logo */}
        <div className="flex h-[57px] shrink-0 items-center gap-2.5 border-b border-border px-4">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-cyan">
            <Activity className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">
            QUANT<span className="text-cyan">FUND</span>
          </span>
          <button
            className="ml-auto rounded-lg p-1 text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary navigation">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to || (to !== "/dashboard" && path.startsWith(to));
            return (
              <Link
                key={to} to={to}
                className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer data badge */}
        <div className="shrink-0 border-t border-border px-3 py-3">
          <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Live data sources</p>
            <div className="space-y-1">
              {["AMFI · mfapi.in", "Yahoo Finance"].map((src) => (
                <div key={src} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-positive" />
                  <span className="font-mono text-[10px] text-foreground">{src}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-56">

        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-[57px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl">
          <button
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          <span className="font-display text-sm font-semibold text-foreground">{title ?? "QuantFund"}</span>

          {/* Global search — desktop */}
          <div className="ml-auto hidden md:block">
            <GlobalSearch className="w-52" />
          </div>

          <button
            aria-label="Notifications"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
          </button>

          <div
            className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-cyan font-mono text-[11px] font-bold text-primary-foreground"
            aria-hidden="true"
          >
            QF
          </div>
        </header>

        {/* Market ticker */}
        <MarketTickerBar />

        {/* Page content */}
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
