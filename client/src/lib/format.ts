export function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
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

export function platformLabel(platform: "polymarket" | "kalshi"): string {
  return platform === "polymarket" ? "Polymarket" : "Kalshi";
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
