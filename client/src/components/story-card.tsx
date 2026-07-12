import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import type { MarketMove } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDelta, formatVolume, platformLabel, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StoryCardProps {
  move: MarketMove;
  onOpen: (move: MarketMove) => void;
}

export function StoryCard({ move, onOpen }: StoryCardProps) {
  const isUp = move.direction === "up";

  return (
    <Card
      className="hover-elevate active-elevate-2 flex flex-col gap-3 p-4 cursor-pointer"
      onClick={() => onOpen(move)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(move);
      }}
      data-testid={`card-story-${move.id}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[10px] tracking-wide uppercase",
              move.platform === "polymarket" ? "text-primary border-primary/30" : "text-chart-4 border-chart-4/30"
            )}
            data-testid={`badge-platform-${move.id}`}
          >
            {platformLabel(move.platform)}
          </Badge>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide" data-testid={`badge-category-${move.id}`}>
            {move.category}
          </Badge>
        </div>
        <span className="text-xs font-mono text-muted-foreground shrink-0" data-testid={`text-timeago-${move.id}`}>
          {timeAgo(move.updatedAt)}
        </span>
      </div>

      <h3 className="font-serif font-semibold text-lg leading-snug text-foreground" data-testid={`text-headline-${move.id}`}>
        {move.headline}
      </h3>

      <div className="flex items-center gap-3 flex-wrap mt-auto pt-1">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-sm font-semibold",
            isUp ? "bg-up/15 text-up" : "bg-down/15 text-down"
          )}
          data-testid={`text-delta-${move.id}`}
        >
          {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {formatDelta(move.changePct)}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-sm text-foreground" data-testid={`text-probability-${move.id}`}>
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          {move.currentProbability.toFixed(0)}%
        </span>
        <span className="font-mono text-xs text-muted-foreground" data-testid={`text-volume-${move.id}`}>
          {formatVolume(move.volume)} vol
        </span>
      </div>
    </Card>
  );
}
