import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketHistoryResponse, MarketMove } from "@shared/schema";

interface MarketHistoryChartProps {
  move: MarketMove;
}

function formatTick(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MarketHistoryChart({ move }: MarketHistoryChartProps) {
  const url = `/api/history?platform=${encodeURIComponent(move.platform)}&id=${encodeURIComponent(
    move.id
  )}&url=${encodeURIComponent(move.url)}`;

  // Single-element queryKey so the default queryFn (which joins queryKey
  // with "/") uses this exact URL string as-is rather than trying to
  // concatenate path segments — same convention as the ["/api/movers"]
  // query in home.tsx.
  const { data, isLoading, isError } = useQuery<MarketHistoryResponse>({
    queryKey: [url],
  });

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center" data-testid="history-chart-loading">
        <div className="h-32 w-full bg-muted/40 rounded-md animate-pulse" />
      </div>
    );
  }

  if (isError || !data || data.points.length < 2) {
    return (
      <div
        className="h-40 flex items-center justify-center text-xs text-muted-foreground"
        data-testid="history-chart-empty"
      >
        No recent price history available for this market.
      </div>
    );
  }

  const chartData = data.points.map((p) => ({
    timestamp: p.timestamp,
    probability: Math.round(p.probability * 10) / 10,
  }));

  return (
    <div data-testid="history-chart">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTick}
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
