import { Info } from "lucide-react";

/**
 * Consistent provenance badge for every page that shows market/fund data.
 * Always renders source + as-of timestamp so users know what they're looking at.
 */
export function DataSourceBadge({
  source,
  asOf,
  note,
}: {
  source: string;
  asOf?: string | null;
  note?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
      <span>
        Source: <span className="text-foreground">{source}</span>
      </span>
      {asOf && (
        <span className="border-l border-border pl-2">
          As of <span className="text-foreground">{asOf}</span>
        </span>
      )}
      {note && (
        <span title={note} className="flex items-center gap-1 border-l border-border pl-2">
          <Info className="h-3 w-3" />
          {note}
        </span>
      )}
    </div>
  );
}
