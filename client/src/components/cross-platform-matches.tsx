import { ExternalLink } from "lucide-react";
import type { CrossPlatformMatch, MarketMove } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { formatDelta, platformBadgeClass, platformLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ResolvedMatch {
  match: CrossPlatformMatch;
  polymarket: MarketMove;
  kalshi: MarketMove;
}

function tierBadgeClass(tier: CrossPlatformMatch["tier"]): string {
  switch (tier) {
    case "high":
      return "bg-chart-2/15 text-chart-2 border-chart-2/30";
    case "medium":
      return "bg-chart-5/15 text-chart-5 border-chart-5/30";
    case "low":
      return "text-muted-foreground border-border";
  }
}

function MatchSide({ move }: { move: MarketMove }) {
  return (
    <a
      href={move.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 min-w-0 flex flex-col gap-1.5 p-3 rounded-md border border-border hover:border-foreground/30 transition-colors group"
      data-testid={`match-side-${move.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn("font-mono text-[10px] tracking-wide uppercase", platformBadgeClass(move.platform))}
        >
          {platformLabel(move.platform)}
        </Badge>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
      <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">{move.title}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span>{move.currentProbability.toFixed(0)}% chance</span>
        <span className={move.direction === "up" ? "text-chart-2" : "text-destructive"}>
          {formatDelta(move.changePct)}
        </span>
      </div>
    </a>
  );
}

function MatchCard({ resolved }: { resolved: ResolvedMatch }) {
  const { match, polymarket, kalshi } = resolved;
  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card"
      data-testid={`match-card-${match.polymarketId}-${match.kalshiId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn("text-[10px] uppercase tracking-wide", tierBadgeClass(match.tier))}
          data-testid={`badge-match-tier-${match.tier}`}
        >
          {match.tier} confidence
        </Badge>
        <span className="text-[11px] font-mono text-muted-foreground" title="Composite match score, 0-1">
          {Math.round(match.confidence * 100)}%
        </span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <MatchSide move={polymarket} />
        <MatchSide move={kalshi} />
      </div>
      {match.signals.sharedEntities.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Matched on: {match.signals.sharedEntities.join(", ")}
        </p>
      )}
    </div>
  );
}

interface CrossPlatformMatchesProps {
  matches: ResolvedMatch[];
}

export function CrossPlatformMatches({ matches }: CrossPlatformMatchesProps) {
  if (matches.length === 0) return null;

  return (
    <section className="mt-10" data-testid="section-cross-platform-matches">
      <h2 className="font-serif font-semibold text-xl text-foreground mb-1">Cross-Platform Matches</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Markets on Polymarket and Kalshi that appear to track the same real-world question, matched
        automatically by title similarity, category, and resolution date. This is a fuzzy match, not a
        guarantee of equivalence — check both sides before treating them as identical, especially anything
        marked "low confidence."
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="grid-cross-platform-matches">
        {matches.map((resolved) => (
          <MatchCard key={`${resolved.match.polymarketId}-${resolved.match.kalshiId}`} resolved={resolved} />
        ))}
      </div>
    </section>
  );
}
