import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Inbox } from "lucide-react";
import type { Category, MarketMove, MoversResponse } from "@shared/schema";
import { CATEGORIES } from "@shared/schema";
import { SiteHeader } from "@/components/site-header";
import { TickerMarquee } from "@/components/ticker-marquee";
import { CategoryTabs } from "@/components/category-tabs";
import { StoryCard } from "@/components/story-card";
import { StoryCardSkeleton } from "@/components/story-card-skeleton";
import { StoryDialog } from "@/components/story-dialog";
import { queryClient } from "@/lib/queryClient";

const REFETCH_INTERVAL_MS = 2.5 * 60 * 1000;

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [selectedMove, setSelectedMove] = useState<MarketMove | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<MoversResponse>({
    queryKey: ["/api/movers"],
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const movers = data?.movers ?? [];
  const extremeMovers = data?.extremeMovers ?? [];

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: movers.length };
    for (const cat of CATEGORIES) result[cat] = 0;
    for (const m of movers) result[m.category] = (result[m.category] ?? 0) + 1;
    return result;
  }, [movers]);

  const filteredMovers = useMemo(() => {
    if (activeCategory === "All") return movers;
    return movers.filter((m) => m.category === activeCategory);
  }, [movers, activeCategory]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
    refetch();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader lastUpdated={data?.lastUpdated ?? null} isFetching={isFetching} onRefresh={handleRefresh} />
      <TickerMarquee moves={extremeMovers} />

      <main className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-xl font-semibold text-foreground">Market Movers</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every headline below is generated automatically from live probability shifts on{" "}
            <a
              href="https://polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Polymarket
            </a>{" "}
            and{" "}
            <a
              href="https://kalshi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Kalshi
            </a>
            . No editors, no delay — just the odds, moving.
          </p>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <CategoryTabs value={activeCategory} onChange={setActiveCategory} counts={counts} />
        </div>

        {isError && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
            data-testid="state-error"
          >
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Couldn't reach the market feed right now. Try refreshing in a moment.
            </p>
          </div>
        )}

        {!isError && isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="state-loading">
            {Array.from({ length: 9 }).map((_, i) => (
              <StoryCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isError && !isLoading && filteredMovers.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
            data-testid="state-empty"
          >
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-sm">
              No significant moves in this category right now. Check back shortly or try another
              category.
            </p>
          </div>
        )}

        {!isError && !isLoading && filteredMovers.length > 0 && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            data-testid="grid-story-cards"
          >
            {filteredMovers.map((move) => (
              <StoryCard key={move.id} move={move} onOpen={setSelectedMove} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-6 mt-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground font-mono">
          <span>Basis Point — automated market-move headlines. Not financial advice.</span>
          <span>
            Sources:{" "}
            <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Polymarket
            </a>{" "}
            &{" "}
            <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Kalshi
            </a>
          </span>
        </div>
      </footer>

      <StoryDialog move={selectedMove} onOpenChange={(open) => !open && setSelectedMove(null)} />
    </div>
  );
}
