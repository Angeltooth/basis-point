import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { MarketMove } from "@shared/schema";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TickerMarqueeProps {
  moves: MarketMove[];
}

export function TickerMarquee({ moves }: TickerMarqueeProps) {
  if (moves.length === 0) return null;

  // Duplicate the list so the CSS translateX(-50%) loop is seamless.
  const items = [...moves, ...moves];

  return (
    <div
      className="relative border-b border-border bg-card overflow-hidden"
      data-testid="ticker-marquee"
      role="marquee"
      aria-label="Extreme market movers"
    >
      <div className="flex animate-marquee whitespace-nowrap will-change-transform hover:[animation-play-state:paused]">
        {items.map((m, i) => (
          <div
            key={`${m.id}-${i}`}
            className="flex items-center gap-2 px-5 py-2 text-sm border-r border-border/60 shrink-0"
            data-testid={`ticker-item-${m.id}-${i}`}
          >
            <span
              className={cn(
                "flex items-center justify-center h-5 w-5 rounded-full shrink-0",
                m.direction === "up" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              )}
            >
              {m.direction === "up" ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="font-medium text-foreground max-w-[16rem] truncate">{m.title}</span>
            <span
              className={cn(
                "font-mono text-xs font-semibold",
                m.direction === "up" ? "text-up" : "text-down"
              )}
            >
              {formatDelta(m.changePct)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {m.currentProbability.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
