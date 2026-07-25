import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryRange, MarketHistoryResponse, MarketMove } from "@shared/schema";
import { HISTORY_RANGES, HISTORY_RANGE_LABELS } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MarketHistoryChartProps {
  move: MarketMove;
}

// Short ranges benefit from a time-of-day tick ("2:30 PM"); once the window
// spans multiple days, a date ("Jul 22") is more useful than a repeating
// clock time.
function formatTick(iso: string, range: HistoryRange): string {
  const d = new Date(iso);
  if (range === "1h" || range === "6h") {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MarketHistoryChart({ move }: MarketHistoryChartProps) {
  const [range, setRange] = useState<HistoryRange>("1w");

  const url = `/api/history?platform=${encodeURIComponent(move.platform)}&id=${encodeURIComponent(
    move.id
  )}&url=${encodeURIComponent(move.url)}&range=${range}`;

  // Single-element queryKey so the default queryFn (which joins queryKey
  // with "/") uses this exact URL string as-is rather than trying to
  // concatenate path segments — same convention as the ["/api/movers"]
  // query in home.tsx. Range is baked into the URL, so switching ranges
  // naturally triggers a refetch under a new cache key.
  const { data, isLoading, isError } = useQuery<MarketHistoryResponse>({
    queryKey: [url],
  });

  const rangeSelector = (
    <div className="flex items-center gap-1 mb-2" data-testid="history-range-selector">
      {HISTORY_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRange(r)}
          className={cn(
            "px-1.5 py-0.5 rounded text-[11px] font-mono uppercase tracking-wide transition-colors",
            r === range
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          data-testid={`button-range-${r}`}
        >
          {HISTORY_RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div data-testid="history-chart-loading">
        {rangeSelector}
        <div className="h-40 flex items-center justify-center">
          <div className="h-32 w-full bg-muted/40 rounded-md animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !data || data.points.length < 2) {
    return (
      <div data-testid="history-chart-empty">
        {rangeSelector}
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
          No price history available for this market over this range.
        </div>
      </div>
    );
  }

  const chartData = data.points.map((p) => ({
    timestamp: p.timestamp,
    probability: Math.round(p.probability * 10) / 10,
  }));

  return (
    <div data-testid="history-chart">
      {rangeSelector}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => formatTick(v, range)}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v) => `${v}%`}
              width={36}
            />
            <Tooltip
              formatter={(value: number) => [`${value}%`, "Probability"]}
              labelFormatter={(label) => new Date(label).toLocaleString()}
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                borderColor: "hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="probability"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {data.source === "bets" && (
        <p className="text-[11px] text-muted-foreground mt-1" data-testid="history-chart-caveat">
          Reconstructed from individual trades — Manifold doesn't provide pre-aggregated price history.
        </p>
      )}
    </div>
  );
}
