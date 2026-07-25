import type { Category, MarketMove } from "@shared/schema";
import { classifyKeywords, classifyKeywordsWithDefault } from "./classify";

// ---------------------------------------------------------------------------
// Manifold Markets integration
//
// Manifold is a play-money prediction market: prices are still genuine
// crowd-aggregated probabilities (anyone can create a market on anything),
// but trading activity is denominated in "Mana" (M$), not real dollars —
// there's no cash value or withdrawal. Two things depend on that fact:
//   1. Every Manifold move is tagged `isPlayMoney: true` in the returned
//      MarketMove, so the UI can badge it distinctly rather than implying
//      real money changed hands.
//   2. rankScore() in ./markets.ts currently feeds Manifold's volume into
//      the exact same activity-weighting formula as Polymarket/Kalshi's
//      real-dollar volume, per product decision — Mana and USD amounts
//      aren't the same unit, so this may need retuning once real relative
//      scale is visible against live data.
//
// FIELD VERIFICATION CAVEAT: this module's network calls could not be
// tested against a live response — api.manifold.markets isn't reachable
// from this build environment's network sandbox. `probChanges` (the
// {day, week, month} delta object used below) is based on documented and
// observed Manifold API behavior, not a live-verified response. The code
// is written defensively: any market missing a usable probChanges value is
// skipped entirely rather than guessed at (see pickBestManifoldWindow).
// Before trusting this in production, confirm the actual response shape of
// `GET https://api.manifold.markets/v0/search-markets?...` and adjust field
// names here if anything doesn't match.
// ---------------------------------------------------------------------------

interface ManifoldProbChanges {
  day?: number;
  week?: number;
  month?: number;
}

interface ManifoldMarket {
  id: string;
  question: string;
  url?: string;
  slug?: string;
  outcomeType: string; // "BINARY" | "MULTIPLE_CHOICE" | "PSEUDO_NUMERIC" | "POLL" | ...
  probability?: number; // 0-1, BINARY markets only
  volume?: number;
  volume24Hours?: number;
  totalLiquidity?: number;
  uniqueBettorCount?: number;
  closeTime?: number; // epoch ms
  isResolved?: boolean;
  groupSlugs?: string[];
  probChanges?: ManifoldProbChanges;
}

function pickBestManifoldWindow(m: ManifoldMarket): { changePct: number; window: string } | null {
  const changes = m.probChanges;
  if (!changes) return null;

  const windows: Array<[number | undefined, string]> = [
    [changes.day, "24h"],
    [changes.week, "7d"],
    [changes.month, "30d"],
  ];
  let best: { changePct: number; window: string } | null = null;
  for (const [val, label] of windows) {
    if (typeof val === "number" && !Number.isNaN(val) && val !== 0) {
      const pct = val * 100; // assumed fractional (0-1 scale), matching Polymarket's price-change field convention — unverified, see module header
      if (!best || Math.abs(pct) > Math.abs(best.changePct)) {
        best = { changePct: pct, window: label };
      }
    }
  }
  return best;
}

// Manifold's "group" (topic) slugs are the closest thing to a native
// category — tried first via the shared keyword matcher, same pattern as
// Polymarket's tags. Falls back to the market question text if no group
// slug yields a confident match.
function classifyManifoldCategory(groupSlugs: string[] | undefined, question: string): Category {
  for (const slug of groupSlugs ?? []) {
    const match = classifyKeywords(slug.replace(/-/g, " "));
    if (match) return match;
  }
  return classifyKeywordsWithDefault(question);
}

function verbFor(direction: "up" | "down", magnitude: number): string {
  if (direction === "up") {
    if (magnitude >= 20) return "surges to";
    if (magnitude >= 10) return "jumps to";
    if (magnitude >= 5) return "climbs to";
    return "edges up to";
  }
  if (magnitude >= 20) return "plunges to";
  if (magnitude >= 10) return "slides to";
  if (magnitude >= 5) return "slips to";
  return "edges down to";
}

function windowLabel(window: string): string {
  switch (window) {
    case "24h":
      return "24h";
    case "7d":
      return "7d";
    case "30d":
      return "30d";
    default:
      return window;
  }
}

function buildManifoldHeadline(
  title: string,
  currentProbability: number,
  changePctPoints: number,
  direction: "up" | "down",
  window: string
): string {
  const magnitude = Math.abs(changePctPoints);
  const verb = verbFor(direction, magnitude);
  const sign = direction === "up" ? "+" : "\u2212";
  const cleanTitle = title.replace(/\?$/, "").trim();
  return `${cleanTitle}: probability ${verb} ${currentProbability.toFixed(0)}% (${sign}${magnitude.toFixed(
    1
  )}pp in ${windowLabel(window)})`;
}

// Mirrors the client's formatVolume, but prefixed as Mana (M$) rather than
// USD ($) — this string gets embedded directly in generated body text, so
// the distinction has to be explicit here, not left to UI styling alone.
function formatMana(v: number): string {
  if (v >= 1_000_000) return `M$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `M$${(v / 1_000).toFixed(0)}K`;
  return `M$${v.toFixed(0)}`;
}

function timeToResolution(closeTimeMs: number | null | undefined): string {
  if (!closeTimeMs) return "an undetermined date";
  const diffMs = closeTimeMs - Date.now();
  if (diffMs <= 0) return "imminently";
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 1) return "within 24 hours";
  if (days < 2) return "tomorrow";
  if (days < 14) return `in ${Math.round(days)} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

function templatedManifoldBody(params: {
  title: string;
  currentProbability: number;
  changePct: number;
  direction: "up" | "down";
  volume: number;
  uniqueBettorCount?: number;
  closeTime?: number | null;
  window: string;
}): string {
  const { title, currentProbability, changePct, direction, volume, uniqueBettorCount, closeTime, window } =
    params;
  const dir = direction === "up" ? "risen" : "fallen";
  const magnitude = Math.abs(changePct).toFixed(1);
  const bettorClause = uniqueBettorCount ? ` from ${uniqueBettorCount} traders` : "";
  const resolution = timeToResolution(closeTime);

  return `Traders on Manifold — a play-money prediction market — have pushed the probability of "${title}" ${dir} by ${magnitude} percentage points over the past ${windowLabel(
    window
  )}, with the market now pricing this outcome at ${currentProbability.toFixed(
    0
  )}%. The move came alongside ${formatMana(
    volume
  )} in 24-hour trading activity${bettorClause}. Manifold uses play-money (Mana), not real currency — prices still reflect aggregated trader belief, but nothing is staked financially. The market is scheduled to resolve ${resolution}.`;
}

// search-markets page size/pagination behavior wasn't verified live (see
// module header) — kept conservative and defensive: a short/empty page
// ends pagination naturally regardless of whether this exact size is right.
const MANIFOLD_PAGE_SIZE = 100;
const MANIFOLD_MAX_PAGES = 5;

export async function fetchManifold(): Promise<MarketMove[]> {
  const baseUrl = "https://api.manifold.markets/v0/search-markets";
  const moves: MarketMove[] = [];

  for (let page = 0; page < MANIFOLD_MAX_PAGES; page++) {
    const offset = page * MANIFOLD_PAGE_SIZE;
    const url = `${baseUrl}?term=&sort=24-hour-vol&filter=open&contractType=BINARY&limit=${MANIFOLD_PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      // Mirrors Polymarket/Kalshi fetch behavior: only a first-page failure
      // is a hard error, so a hiccup partway through pagination doesn't
      // discard everything already fetched.
      if (page === 0) throw new Error(`Manifold fetch failed: ${res.status}`);
      break;
    }
    const data: ManifoldMarket[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const m of data) {
      try {
        if (m.isResolved) continue;
        // Keep to Yes/No markets, consistent with how every MarketMove
        // elsewhere in this app is modeled (a single currentProbability).
        if (m.outcomeType !== "BINARY") continue;
        if (typeof m.probability !== "number") continue;

        const best = pickBestManifoldWindow(m);
        if (!best) continue; // no usable probChanges data — see field-verification caveat above

        const currentProbability = m.probability * 100;
        const direction: "up" | "down" = best.changePct >= 0 ? "up" : "down";
        const volume = m.volume24Hours ?? 0;
        const liquidity = m.totalLiquidity ?? undefined;
        const category = classifyManifoldCategory(m.groupSlugs, m.question);

        const body = templatedManifoldBody({
          title: m.question,
          currentProbability,
          changePct: best.changePct,
          direction,
          volume,
          uniqueBettorCount: m.uniqueBettorCount,
          closeTime: m.closeTime,
          window: best.window,
        });

        moves.push({
          id: `mf-${m.id}`,
          platform: "manifold",
          title: m.question,
          headline: buildManifoldHeadline(m.question, currentProbability, best.changePct, direction, best.window),
          category,
          currentProbability,
          changePct: best.changePct,
          direction,
          window: best.window,
          volume,
          liquidity,
          url: m.url ?? (m.slug ? `https://manifold.markets/market/${m.slug}` : "https://manifold.markets"),
          image: null,
          body,
          bodySource: "generated" as const,
          isPlayMoney: true,
          endDate: m.closeTime ? new Date(m.closeTime).toISOString() : null,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        continue;
      }
    }

    if (data.length < MANIFOLD_PAGE_SIZE) break; // short page means no more data
  }

  return moves;
}
