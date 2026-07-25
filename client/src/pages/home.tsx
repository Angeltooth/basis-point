import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { AlertTriangle, Inbox, SearchX } from "lucide-react";
import type { Category, MarketMove, MoversResponse } from "@shared/schema";
import { CATEGORIES } from "@shared/schema";
import { SiteHeader } from "@/components/site-header";
import { TickerMarquee } from "@/components/ticker-marquee";
import { CategoryTabs } from "@/components/category-tabs";
import { SearchBar } from "@/components/search-bar";
import { StoryCard } from "@/components/story-card";
import { StoryCardSkeleton } from "@/components/story-card-skeleton";
import { StoryDialog } from "@/components/story-dialog";
import { queryClient } from "@/lib/queryClient";

const REFETCH_INTERVAL_MS = 2.5 * 60 * 1000;

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [selectedMove, setSelectedMove] = useState<MarketMove | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce the value actually used for search execution, separate from
  // what's shown in the input — keeps typing responsive while avoiding a
  // Fuse re-index/search on every single keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<MoversResponse>({
    queryKey: ["/api/movers"],
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const movers = data?.movers ?? [];
  const extremeMovers = data?.extremeMovers ?? [];
  const isSearching = searchQuery.trim().length >= 2;

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: movers.length };
    for (const cat of CATEGORIES) result[cat] = 0;
    for (const m of movers) result[m.category] = (result[m.category] ?? 0) + 1;
    return result;
  }, [movers]);

  // Extended search gives special meaning to a few leading characters
  // (! for NOT, ' for exact-match, ^/$ for prefix/suffix, | for OR between
  // terms) — without stripping these, someone typing "!bitcoin" expecting
  // emphasis would silently get an inverted "exclude bitcoin" search with
  // no indication why. This keeps the AND-of-fuzzy-words behavior predictable
  // regardless of what a user types.
  const sanitizeSearchQuery = (raw: string) =>
    raw
      .split(/\s+/)
      .map((word) => word.replace(/^['"^!=]+/, "").replace(/[$|]/g, ""))
      .filter(Boolean)
      .join(" ");

  // Re-built whenever the underlying movers list changes (e.g. on refresh),
  // not on every keystroke — the index itself is independent of the query.
  // useExtendedSearch matters here: without it, a query like "fed rate"
  // is treated as one contiguous pattern and fails to match a title like
  // "Will the Fed cut rates..." because "cut" sits between the two words.
  // Extended search treats space-separated words as independent fuzzy terms
  // (ANDed together), which matches how people actually search.
  const fuse = useMemo(
    () =>
      new Fuse(movers, {
        keys: [
          { name: "title", weight: 0.7 },
          { name: "category", weight: 0.15 },
          { name: "platform", weight: 0.15 },
        ],
        threshold: 0.35, // lower = stricter; 0.35 tolerates a couple of typos per word
        ignoreLocation: true,
        minMatchCharLength: 2,
        useExtendedSearch: true,
      }),
    [movers]
  );

  // Search replaces the category filter entirely while active, rather than
  // combining with it — searching "fed" should surface Fed-related markets
  // across every category, not just whichever tab happened to be selected.
  const filteredMovers = useMemo(() => {
    if (isSearching) return fuse.search(sanitizeSearchQuery(searchQuery.trim())).map((r) => r.item);
    if (activeCategory === "All") return movers;
    return movers.filter((m) => m.category === activeCategory);
  }, [movers, activeCategory, isSearching, searchQuery, fuse]);

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

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 flex-1 min-w-0">
            {isSearching ? (
              <p className="text-sm text-muted-foreground" data-testid="text-search-status">
                {filteredMovers.length} result{filteredMovers.length === 1 ? "" : "s"} for "{searchQuery.trim()}"
              </p>
            ) : (
              <CategoryTabs value={activeCategory} onChange={setActiveCategory} counts={counts} />
            )}
          </div>
          <SearchBar value={searchInput} onChange={setSearchInput} />
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
            {isSearching ? (
              <>
                <SearchX className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground max-w-sm">
                  No markets match "{searchQuery.trim()}". Try a different search or{" "}
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    clear the search
                  </button>
                  .
                </p>
              </>
            ) : (
              <>
                <Inbox className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground max-w-sm">
                  No significant moves in this category right now. Check back shortly or try another
                  category.
                </p>
              </>
            )}
          </div>
        )}

        {!isError && !isLoading && filteredMovers.length > 0 && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            data-testid="grid-story-cards"
          >
            {filteredMovers.map((move) => (
              <StoryCard
                key={move.id}
                move={move}
                onOpen={setSelectedMove}
                highlightQuery={isSearching ? searchQuery.trim() : undefined}
              />
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
