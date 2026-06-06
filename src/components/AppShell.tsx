import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Search, GitCompare, Briefcase, Filter,
  History, Sparkles, Trophy, Settings, Activity, Menu, Bell, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/explorer", label: "Fund Explorer", icon: Search },
  { to: "/compare", label: "Fund Compare", icon: GitCompare },
  { to: "/portfolio", label: "Portfolio Analyzer", icon: Briefcase },
  { to: "/screener", label: "Screener", icon: Filter },
  { to: "/backtest", label: "Backtesting", icon: History },
  { to: "/research-desk", label: "Research Desk", icon: Sparkles },
  { to: "/rankings", label: "Rankings", icon: Trophy },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

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
                <Icon className="h-4 w-4" /> {label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan" />}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-border bg-card/60 p-3 text-xs">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Data status</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-positive" /> Live · 4,128 schemes</div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu"><Menu className="h-5 w-5"/></button>
          <h1 className="font-display text-sm font-semibold">{pageTitle}</h1>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <label htmlFor="appshell-search" className="sr-only">Search schemes</label>
              <input id="appshell-search" placeholder="Search 4,128 schemes…" className="w-72 bg-transparent outline-none placeholder:text-muted-foreground" />
              <kbd className="rounded border border-border px-1 font-mono text-[10px]">⌘K</kbd>
            </div>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface" aria-label="Notifications"><Bell className="h-4 w-4"/></button>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-cyan font-mono text-xs font-bold text-primary-foreground" aria-hidden="true">QF</div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
