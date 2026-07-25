import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import type { MarketMove } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDelta, formatMoveVolume, platformLabel, platformBadgeClass, timeAgo, windowBadgeLabel, isInstantTick } from "@/lib/format";
import { highlightMatch } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface StoryCardProps {
  move: MarketMove;
  onOpen: (move: MarketMove) => void;
  highlightQuery?: string;
}

export function StoryCard({ move, onOpen, highlightQuery }: StoryCardProps) {
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
            className={cn("font-mono text-[10px] tracking-wide uppercase", platformBadgeClass(move.platform))}
            data-testid={`badge-platform-${move.id}`}
          >
            {platformLabel(move.platform)}
          </Badge>
          {move.isPlayMoney && (
            <Badge
              variant="outline"
              className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground border-border"
              data-testid={`badge-playmoney-${move.id}`}
              title="Manifold uses play-money (Mana), not real currency"
            >
              Play Money
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide" data-testid={`badge-category-${move.id}`}>
            {highlightQuery ? highlightMatch(move.category, highlightQuery) : move.category}
          </Badge>
        </div>
        <span className="text-xs font-mono text-muted-foreground shrink-0" data-testid={`text-timeago-${move.id}`}>
          {timeAgo(move.updatedAt)}
        </span>
      </div>

      <h3 className="font-serif font-semibold text-lg leading-snug text-foreground" data-testid={`text-headline-${move.id}`}>
        {highlightQuery ? highlightMatch(move.headline, highlightQuery) : move.headline}
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
          {formatMoveVolume(move)} vol
        </span>
        <span
          className={cn(
            "font-mono text-[10px] tracking-wide uppercase rounded px-1.5 py-0.5 border",
            isInstantTick(move.window)
              ? "text-amber-600 border-amber-600/30 dark:text-amber-400 dark:border-amber-400/30"
              : "text-muted-foreground border-border"
          )}
          data-testid={`badge-window-${move.id}`}
          title={
            isInstantTick(move.window)
              ? "Based on the two most recent trades — may reflect a single small trade rather than a sustained trend"
              : `Measured over ${move.window}`
          }
        >
          {windowBadgeLabel(move.window)}
        </span>
      </div>
    </Card>
  );
}
