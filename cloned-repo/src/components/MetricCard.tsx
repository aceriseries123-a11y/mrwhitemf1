import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function MetricCard({
  label, value, delta, icon: Icon, suffix, hint, children,
}: {
  label: string;
  value: string | number;
  delta?: number;
  icon?: LucideIcon;
  suffix?: string;
  hint?: string;
  children?: ReactNode;
}) {
  const pos = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-cyan" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2 font-mono">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        {typeof delta === "number" ? (
          <span className={`inline-flex items-center gap-1 font-mono ${pos ? "text-positive" : "text-negative"}`}>
            {pos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {pos ? "+" : ""}{delta.toFixed(2)}%
          </span>
        ) : <span />}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </motion.div>
  );
}
