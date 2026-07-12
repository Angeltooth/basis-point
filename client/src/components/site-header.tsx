import { Moon, RefreshCw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { useTheme } from "@/components/theme-provider";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  lastUpdated: string | null;
  isFetching: boolean;
  onRefresh: () => void;
}

export function SiteHeader({ lastUpdated, isFetching, onRefresh }: SiteHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo />
          </div>
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-xs text-muted-foreground font-mono">
              odds, priced as news
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden sm:inline text-xs font-mono text-muted-foreground"
              data-testid="text-last-updated"
            >
              {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : "Loading\u2026"}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              aria-label="Refresh market data"
              data-testid="button-refresh"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
