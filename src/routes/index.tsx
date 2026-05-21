import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

import {
  ArrowRight, Activity, Brain, BarChart3, Layers, ShieldCheck,
  Trophy, LineChart, Target,
} from "lucide-react";
import { Chart, axisStyle } from "@/components/Chart";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QuantFund — Advanced Quantitative Mutual Fund Research" },
      { name: "description", content: "Institutional-grade mutual fund analytics: rolling returns, risk-adjusted scoring, drawdowns, portfolio optimization, and AI-powered fund research." },
      { property: "og:title", content: "QuantFund — Quant Mutual Fund Research" },
      { property: "og:description", content: "Bloomberg-style mutual fund analytics for serious investors." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-cyan ring-glow">
              <Activity className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-bold tracking-tight">QUANTFUND<span className="text-cyan">.</span></span>
          </Link>
          <nav className="ml-10 hidden gap-6 text-sm text-muted-foreground md:flex">
            <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <Link to="/ai-insights" className="hover:text-foreground">AI Insights</Link>
            <Link to="/rankings" className="hover:text-foreground">Rankings</Link>
            <Link to="/portfolio" className="hover:text-foreground">Portfolio</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/dashboard" className="hidden rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground md:inline">Sign in</Link>
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-cyan px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-glow">
              Open terminal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-hero relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 md:pt-28">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
              Live · 4,128 schemes · 20Y historical NAV
            </div>
            <h1 className="mt-6 max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Advanced quantitative <span className="bg-gradient-to-r from-primary via-cyan to-primary bg-clip-text text-transparent">mutual fund</span> research platform.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
              Professional rolling return analysis, risk-adjusted scoring, drawdown analytics, portfolio optimization, and AI-powered fund research — built for serious investors.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-cyan px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow">
                Open terminal <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/explorer" className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold hover:bg-muted">
                Explore funds
              </Link>
            </div>
          </motion.div>

          {/* Terminal preview */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="glass mt-12 overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-negative/70" />
              <span className="h-2 w-2 rounded-full bg-warning/70" />
              <span className="h-2 w-2 rounded-full bg-positive/70" />
              <span className="ml-3 font-mono">quantfund / dashboard / overview</span>
              <span className="ml-auto font-mono">NIFTY 50 · 24,612.40 <span className="text-positive">+0.42%</span></span>
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
              <HeroChart />
              <RollingHeatmap />
              <TopRanked />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Highlights */}
      <section id="analytics" className="mx-auto max-w-7xl px-4 py-20">
        <SectionHeader eyebrow="Analytics" title="Quant research, decoded for retail" subtitle="Everything an institutional desk uses — rolling returns, drawdowns, capture ratios, factor exposure — at retail clarity." />
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <motion.div key={h.title} whileHover={{ y: -2 }} className="glass rounded-2xl p-6">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-cyan"><h.icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-display text-lg font-semibold">{h.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{h.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* AI scoring */}
      <section id="ai" className="border-y border-border bg-surface/30">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 py-20 md:grid-cols-2 md:items-center">
          <div>
            <SectionHeader eyebrow="AI Scoring" title="Composite Buy Score, beyond trailing returns" subtitle="A 9-factor institutional model that penalises volatility, rewards consistency, and stress-tests across regimes." />
            <ul className="mt-6 space-y-2 text-sm">
              {SCORE_WEIGHTS.map((s) => (
                <li key={s.label} className="flex items-center gap-3">
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan" style={{ width: `${s.w * 4}%` }} />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{s.w}%</span>
                  <span className="text-sm">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Composite Buy Score</div>
            <Chart height={320} option={{
              radar: {
                indicator: [
                  { name: "Returns", max: 100 }, { name: "Risk-Adj", max: 100 },
                  { name: "Consistency", max: 100 }, { name: "Downside", max: 100 },
                  { name: "Efficiency", max: 100 }, { name: "Diversification", max: 100 },
                ],
                splitArea: { areaStyle: { color: ["transparent"] } },
                axisName: { color: "rgba(245,247,250,0.7)", fontSize: 11 },
                splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
              },
              series: [{
                type: "radar",
                data: [
                  { value: [88, 84, 92, 79, 76, 81], name: "Top Pick", areaStyle: { color: "rgba(120,200,255,0.25)" }, lineStyle: { color: "#7ad6ff" }, itemStyle: { color: "#7ad6ff" } },
                  { value: [70, 65, 62, 58, 72, 60], name: "Category Avg", lineStyle: { color: "rgba(255,255,255,0.4)" }, itemStyle: { color: "rgba(255,255,255,0.4)" } },
                ],
              }],
              legend: { data: ["Top Pick", "Category Avg"], textStyle: { color: "rgba(245,247,250,0.7)" }, top: 4 },
            }} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
          Stop picking funds by 1Y return.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Open the QuantFund terminal and start ranking the full Indian MF universe by what actually matters — risk-adjusted, regime-tested compounding.
        </p>
        <Link to="/dashboard" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-cyan px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow">
          Launch terminal <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} QuantFund · Research platform · For educational use
      </footer>
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-xs font-mono uppercase tracking-[0.2em] text-cyan">{eyebrow}</div>
      <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">{subtitle}</p>
    </div>
  );
}

const HIGHLIGHTS = [
  { icon: BarChart3, title: "Rolling return heatmaps", desc: "Daily, weekly, monthly windows over 20Y — see consistency, not lucky points." },
  { icon: ShieldCheck, title: "Drawdown & recovery", desc: "Max DD, Ulcer Index, recovery time, bear-market survival score." },
  { icon: Brain, title: "AI fund ranking", desc: "9-factor composite score with category-relative percentile normalisation." },
  { icon: Layers, title: "Portfolio optimizer", desc: "Efficient frontier, overlap analysis, risk parity, diversification score." },
  { icon: LineChart, title: "Risk-adjusted scoring", desc: "Sharpe, Sortino, Treynor, Information Ratio, downside deviation." },
  { icon: Target, title: "Smart screener", desc: "Multi-condition filters with percentile + outlier removal across the universe." },
];

const SCORE_WEIGHTS = [
  { label: "Rolling Return Consistency", w: 25 },
  { label: "Downside Protection", w: 20 },
  { label: "Sharpe Ratio", w: 15 },
  { label: "Drawdown Stability", w: 10 },
  { label: "Benchmark Outperformance", w: 10 },
  { label: "Expense Efficiency", w: 10 },
  { label: "Fund Manager Stability", w: 5 },
  { label: "Portfolio Diversification", w: 5 },
];

// Static, deterministic demo data so the landing page never blocks the main
// thread. Real data loads on /dashboard.
const HERO_LABELS = Array.from({ length: 36 }, (_, i) => {
  const d = new Date(); d.setMonth(d.getMonth() - (35 - i));
  return d.toISOString().slice(0, 7);
});
const HERO_FUND = (() => {
  let v = 100; const out: number[] = [];
  for (let i = 0; i < 36; i++) {
    v *= 1 + (Math.sin(i * 0.6) * 0.015 + 0.014 + (i % 7 === 0 ? -0.02 : 0));
    out.push(+v.toFixed(2));
  }
  return out;
})();
const HERO_BENCH = (() => {
  let v = 100; const out: number[] = [];
  for (let i = 0; i < 36; i++) {
    v *= 1 + (Math.cos(i * 0.5) * 0.012 + 0.009);
    out.push(+v.toFixed(2));
  }
  return out;
})();
const HERO_RET = +((HERO_FUND[HERO_FUND.length - 1] / HERO_FUND[0] - 1) * 100).toFixed(1);

function HeroChart() {
  const labels = HERO_LABELS, fundData = HERO_FUND, benchData = HERO_BENCH, ret3Y = HERO_RET;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 md:col-span-2">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">NAV · Indexed to 100</span>
        <span className={`font-mono ${ret3Y >= 0 ? "text-positive" : "text-negative"}`}>
          {ret3Y >= 0 ? "+" : ""}{ret3Y}% · 3Y
        </span>
      </div>
      <Chart height={220} option={{
        xAxis: { type: "category", data: labels, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, showMaxLabel: true, interval: Math.floor(labels.length / 6) } },
        yAxis: { type: "value", scale: true, ...axisStyle },
        legend: { data: ["Top Pick", "Benchmark"], textStyle: { color: "rgba(245,247,250,0.7)" }, top: 0, right: 0 },
        series: [
          { name: "Top Pick", type: "line", showSymbol: false, data: fundData, smooth: true,
            lineStyle: { width: 2, color: "#7ad6ff" },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(122,214,255,0.35)" }, { offset: 1, color: "rgba(122,214,255,0)" }] } } },
          { name: "Benchmark", type: "line", showSymbol: false, data: benchData, smooth: true,
            lineStyle: { width: 1.5, color: "rgba(255,255,255,0.45)", type: "dashed" } },
        ],
      }} />
    </div>
  );
}

const HEATMAP_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HEATMAP_YEARS = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 8 }, (_, i) => String(y - 7 + i));
})();
const HEATMAP_DATA: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let y = 0; y < HEATMAP_YEARS.length; y++) {
    for (let m = 0; m < 12; m++) {
      const r = +((Math.sin(y * 1.3 + m * 0.7) * 6 + Math.cos(m * 0.5) * 3 + 1.5).toFixed(1));
      out.push([m, y, r]);
    }
  }
  return out;
})();

function RollingHeatmap() {
  const months = HEATMAP_MONTHS, years = HEATMAP_YEARS, data = HEATMAP_DATA;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 md:col-span-2">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">Monthly returns · Heatmap</span>
        <span className="font-mono text-cyan">{years.length}Y window</span>
      </div>
      <Chart height={220} option={{
        tooltip: { position: "top", formatter: (p: any) => `${months[p.data[0]]} ${years[p.data[1]]}: ${p.data[2]}%` },
        grid: { left: 36, right: 12, top: 8, bottom: 24 },
        xAxis: { type: "category", data: months, ...axisStyle, splitArea: { show: true } },
        yAxis: { type: "category", data: years, ...axisStyle, splitArea: { show: true } },
        visualMap: { min: -10, max: 18, calculable: false, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: "rgba(245,247,250,0.6)" },
          inRange: { color: ["#e74c3c", "#3a3f55", "#2dd4a8"] } },
        series: [{ type: "heatmap", data, label: { show: false }, itemStyle: { borderColor: "rgba(0,0,0,0.4)", borderWidth: 1 } }],
      }} />
    </div>
  );
}

const TOP_RANKED_DEMO = [
  { code: "1", amc: "Parag Parikh", bucket: "Flexi Cap", aiScore: 92, r3Y: 24.6 },
  { code: "2", amc: "Quant", bucket: "Small Cap", aiScore: 89, r3Y: 32.1 },
  { code: "3", amc: "HDFC", bucket: "Mid Cap", aiScore: 86, r3Y: 27.4 },
  { code: "4", amc: "Nippon India", bucket: "Multi Cap", aiScore: 84, r3Y: 22.8 },
  { code: "5", amc: "Axis", bucket: "ELSS", aiScore: 81, r3Y: 19.3 },
  { code: "6", amc: "ICICI Pru", bucket: "Large & Mid", aiScore: 79, r3Y: 21.0 },
];

function TopRanked() {
  const ranked = TOP_RANKED_DEMO;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">Top ranked · AI score</span>
        <Trophy className="h-3.5 w-3.5 text-cyan" />
      </div>
      <div className="space-y-2">
        {ranked.map((f, i) => (
          <div key={f.code} className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-2.5 py-2">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-cyan font-mono text-[10px] font-bold text-primary-foreground">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{f.amc}</div>
              <div className="text-[10px] text-muted-foreground">{f.bucket}</div>
            </div>
            <div className="text-right font-mono text-xs">
              <div className="text-cyan">{f.aiScore}</div>
              <div className="text-[10px] text-positive">{f.r3Y.toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  }

