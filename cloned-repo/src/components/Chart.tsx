import * as React from "react";
import { lazy, Suspense, useMemo, useEffect, useState } from "react";
import type { EChartsOption } from "echarts";

// Client-only lazy import — echarts-for-react default export interop is unreliable during SSR.
const ReactECharts = lazy(() => import("echarts-for-react").then(m => ({ default: ((m as any).default ?? m) as React.ComponentType<any> })));

const baseTheme = {
  textStyle: { fontFamily: "Inter, sans-serif", color: "rgba(245,247,250,0.85)" },
  backgroundColor: "transparent",
};

export function Chart({
  option,
  height = 280,
  className = "",
}: { option: EChartsOption; height?: number | string; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const merged = useMemo<EChartsOption>(() => ({
    ...baseTheme,
    grid: { left: 40, right: 16, top: 24, bottom: 28, containLabel: true, ...(option.grid as object) },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(20,26,38,0.95)",
      borderColor: "rgba(120,200,255,0.25)",
      textStyle: { color: "#f5f7fa", fontSize: 12 },
      ...(option.tooltip as object),
    },
    ...option,
  }), [option]);

  if (!mounted) {
    return <div style={{ height, width: "100%" }} className={className} />;
  }

  return (
    <Suspense fallback={<div style={{ height, width: "100%" }} className={className} />}>
      <ReactECharts
        option={merged}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
        className={className}
      />
    </Suspense>
  );
}

export const axisStyle = {
  axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
  axisTick: { show: false },
  axisLabel: { color: "rgba(245,247,250,0.55)", fontSize: 11 },
  splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
};
