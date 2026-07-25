export function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// Manifold's volume is play-money ("Mana"), not real dollars — showing
// "$1.2K" for a Mana amount would misrepresent it as real money traded.
// Any code displaying a move's volume should go through this rather than
// calling formatVolume directly on move.volume.
export function formatMoveVolume(move: { volume: number; isPlayMoney?: boolean }): string {
  if (!move.isPlayMoney) return formatVolume(move.volume);
  const v = move.volume;
  if (v >= 1_000_000) return `M$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `M$${(v / 1_000).toFixed(0)}K`;
  return `M$${v.toFixed(0)}`;
}

export function formatDelta(changePct: number): string {
  const sign = changePct >= 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(changePct).toFixed(1)}pp`;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type Platform = "polymarket" | "kalshi" | "manifold";

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "polymarket":
      return "Polymarket";
    case "kalshi":
      return "Kalshi";
    case "manifold":
      return "Manifold";
  }
}

export function platformBadgeClass(platform: Platform): string {
  switch (platform) {
    case "polymarket":
      return "text-primary border-primary/30";
    case "kalshi":
      return "text-chart-4 border-chart-4/30";
    case "manifold":
      return "text-chart-2 border-chart-2/30";
  }
}

// A "latest tick" move is the delta between the two most recent trades —
// could be seconds apart — as opposed to a genuine 1h/24h/7d/30d window.
// Surfacing this distinguishes "one thin trade just happened" from
// "sustained conviction over time," which otherwise read as equivalent.
export function isInstantTick(window: string): boolean {
  return window === "latest tick";
}

export function windowBadgeLabel(window: string): string {
  return isInstantTick(window) ? "TICK" : window.toUpperCase();
}
