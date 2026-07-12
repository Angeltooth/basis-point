import { ArrowUpRight, ArrowDownRight, ExternalLink } from "lucide-react";
import type { MarketMove } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDelta, formatVolume, platformLabel, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StoryDialogProps {
  move: MarketMove | null;
  onOpenChange: (open: boolean) => void;
}

export function StoryDialog({ move, onOpenChange }: StoryDialogProps) {
  if (!move) return null;
  const isUp = move.direction === "up";

  return (
    <Dialog open={!!move} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-story-detail">
        <DialogHeader>
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px] tracking-wide uppercase",
                move.platform === "polymarket" ? "text-primary border-primary/30" : "text-chart-4 border-chart-4/30"
              )}
            >
              {platformLabel(move.platform)}
            </Badge>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {move.category}
            </Badge>
            <span className="text-xs font-mono text-muted-foreground ml-auto" data-testid="text-dialog-timeago">
              {timeAgo(move.updatedAt)}
            </span>
          </div>
          <DialogTitle className="font-serif text-xl leading-snug text-left" data-testid="text-dialog-headline">
            {move.headline}
          </DialogTitle>
          <DialogDescription className="sr-only">Market move detail for {move.title}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 flex-wrap py-2 border-y border-border">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-mono text-base font-semibold",
              isUp ? "bg-up/15 text-up" : "bg-down/15 text-down"
            )}
            data-testid="text-dialog-delta"
          >
            {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {formatDelta(move.changePct)}
          </span>
          <span className="font-mono text-base text-foreground" data-testid="text-dialog-probability">
            {move.currentProbability.toFixed(1)}% chance
          </span>
          <span className="font-mono text-sm text-muted-foreground" data-testid="text-dialog-volume">
            {formatVolume(move.volume)} 24h volume
          </span>
        </div>

        <p className="text-base leading-relaxed text-foreground" data-testid="text-dialog-body">
          {move.body}
        </p>

        <Button asChild className="w-fit" data-testid="link-dialog-external">
          <a href={move.url} target="_blank" rel="noopener noreferrer">
            View live market on {platformLabel(move.platform)}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
