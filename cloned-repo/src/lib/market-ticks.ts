import { useQuery } from "@tanstack/react-query";

export interface MarketTick {
  label: string;
  nav: number | null;
  chg: number | null;
  date: string | null;
}

export function useMarketTicks() {
  return useQuery<MarketTick[]>({
    queryKey: ["market-ticks"],
    queryFn: async () => {
      const r = await fetch("/api/public/market-ticks", {
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<MarketTick[]>;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });
}
