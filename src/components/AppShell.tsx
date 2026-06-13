import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Search, GitCompare, Briefcase, Filter,
  History, FlaskConical, Trophy, Settings, Activity, Menu, Bell, X,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMarketTicks, type MarketTick } from "@/lib/market-ticks";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/explorer", label: "Fund Explorer", icon: Search },
  { to: "/compare", label: "Fund Compare", icon: GitCompare },
  { to: "/portfolio", label: "Portfolio Analyzer", icon: Briefcase },
  { to: "/screener", label: "Screener", icon: Filter },
  { to: "/backtest", label: "Backtesting", icon: History },
  { to: "/research-desk", label: "Research Desk", icon: FlaskConical },
  { to: "/rankings", label: "Rankings", icon: Trophy },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function TickerItem({ tick }: { tick: MarketTick }) {
  const chg = tick.chg;
  const isPos = chg != null && chg > 0;
  const isNeg = chg != null && chg < 0;
  const chgClass = isPos ? "text-positive" : isNeg ? "text-negative" : "text-muted-foreground";
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 px-3 border-r border-border last:border-r-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{tick.label}</span>
      <span className="font-mono text-[11px] font-bold tabular-nums text-foreground">
        {tick.nav != null ? tick.nav.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
      </span>
      {chg != null ? (
        <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-medium tabular-nums ${chgClass}`}>
          <Icon className="h-2.5 w-2.5" />
          {isPos ? "+" : ""}{chg.toFixed(2)}%
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
      <div className="flex h-7 items-center border-b border-border bg-surface/60 px-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground animate-pulse">
          Loading market data…
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-7 items-center border-b border-border bg-surface/60 px-4 gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Market data unavailable · Source: Yahoo Finance
        </span>
      </div>
    );
  }

  const asOf = data.find((t) => t.date)?.date;
  const asOfLabel = asOf
    ? new Date(asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    : null;

  return (
    <div className="flex h-7 items-center overflow-x-auto border-b border-border bg-surface/60 no-scrollbar">
      <span className="flex shrink-0 items-center gap-1.5 border-r border-border px-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Live</span>
      </span>
      {data.map((tick) => (
        <TickerItem key={tick.label} tick={tick} />
      ))}
      {asOfLabel && (
        <span className="ml-auto shrink-0 border-l border-border px-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {asOfLabel} IST · Yahoo Finance
        </span>
      )}
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const pageTitle = title ?? "Dashboard";
  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 border-r border-border bg-surface/80 backdrop-blur-xl transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-cyan ring-glow">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="font-display text-sm font-bold tracking-tight">QUANTFUND<span className="text-cyan">.</span></div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation menu"><X className="h-4 w-4"/></button>
        </div>
        <nav className="px-2 py-3" aria-label="Primary">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to || (to !== "/dashboard" && path.startsWith(to));
            return (
              <Link key={to} to={to} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Icon className="h-4 w-4 shrink-0" /> {label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan" />}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-border bg-card/60 p-3 text-xs">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Data sources</div>
          <div className="flex items-center gap-2 mb-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" /><span className="text-foreground">AMFI · mfapi.in</span></div>
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" /><span className="text-foreground">Yahoo Finance</span></div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu"><Menu className="h-5 w-5"/></button>
          <h1 className="font-display text-sm font-semibold">{pageTitle}</h1>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link to="/explorer" className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Search className="h-3.5 w-3.5" /> Search schemes
              <kbd className="rounded border border-border px-1 font-mono text-[10px]">⌘K</kbd>
            </Link>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface" aria-label="Notifications"><Bell className="h-4 w-4"/></button>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-cyan font-mono text-xs font-bold text-primary-foreground" aria-hidden="true">QF</div>
        </header>
        <MarketTickerBar />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
