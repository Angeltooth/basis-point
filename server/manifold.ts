import type { Category, MarketMove } from "@shared/schema";
import { classifyKeywords, classifyKeywordsWithDefault } from "./classify";

// ---------------------------------------------------------------------------
// Manifold Markets integration
//
// Manifold is a play-money prediction market: prices are still genuine
// crowd-aggregated probabilities (anyone can create a market on anything),
// but trading activity on regular markets is denominated in "Mana" (M$), not
// real dollars — there's no cash value or withdrawal for those. (Manifold
// also runs real-money "CASH" token markets in some regions; `isPlayMoney`
// below is derived from the actual `token` field rather than assumed, so a
// CASH-token market won't be mislabeled.)
//
// FIELD SHAPE — verified against a live response on 2026-07-25 via
// `GET /v0/search-markets?...&limit=1`: the earlier version of this module
// assumed a `probChanges: {day, week, month}` field for historical price
// deltas. That field does NOT exist on this endpoint's response — confirmed
// against real data, not a guess. There is also no `groupSlugs` field on
// this response shape, so category classification for Manifold falls back
// to question-text keyword matching every time in practice (see
// classifyManifoldCategory), not primarily group-slug matching as originally
// designed.
//
// Since Manifold's public API doesn't expose a ready-made price-change
// field, changePct is computed by diffing each market's probability against
// what was observed on this server's *previous* fetch cycle (a module-level
// in-memory map, keyed by market ID) — the same snapshot-to-snapshot idea
// Kalshi's "latest tick" already uses here, just at our own ~3-minute poll
// interval rather than trade-to-trade. Practical consequences:
//   - A market contributes no changePct on the first cycle it's ever seen
//     (nothing to diff against yet) — after a server restart, Manifold
//     will show zero movers for the first ~3 minutes, then populate from
//     the second cache refresh onward.
//   - The window value reuses Kalshi's "latest tick" label on purpose: it
//     gets the same UI badge (client's isInstantTick()) and the same
//     INSTANT_TICK_DISCOUNT treatment in rankScore()'s ranking formula,
//     which is honestly appropriate here too — a poll-to-poll snapshot
//     diff is not a rigorous historical window either.
// ---------------------------------------------------------------------------

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
  groupSlugs?: string[]; // not present on the /v0/search-markets shape observed live; kept optional in case other endpoints/environments differ
  token?: string; // "MANA" (play-money) or "CASH" (real-money) — confirmed present on live response
}

// Module-level state persisting across fetch cycles within this server
// process (same pattern as the movers cache in ./markets.ts) — this is what
// makes the poll-to-poll diff possible without Manifold providing history.
const previousProbabilities = new Map<string, { probability: number; timestamp: number }>();

const MIN_POLL_GAP_MS = 60 * 1000; // ignore diffs from implausibly short gaps (e.g. a manual force-refresh moments after the last one)
const PREVIOUS_PROBABILITY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Bounds memory growth as the set of "currently trending on Manifold"
// markets shifts over a long-running server process — anything not seen in
// 2 hours has fallen well out of the volume-sorted window we fetch anyway.
function prunePreviousProbabilities() {
  const cutoff = Date.now() - PREVIOUS_PROBABILITY_TTL_MS;
  previousProbabilities.forEach((entry, id) => {
    if (entry.timestamp < cutoff) previousProbabilities.delete(id);
  });
}

function computeManifoldChange(id: string, currentProbabilityFraction: number): { changePct: number; window: string } | null {
  const now = Date.now();
  const previous = previousProbabilities.get(id);
  previousProbabilities.set(id, { probability: currentProbabilityFraction, timestamp: now });

  if (!previous) return null; // first time seeing this market this server run
  const elapsedMs = now - previous.timestamp;
  if (elapsedMs < MIN_POLL_GAP_MS) return null;

  const changePct = (currentProbabilityFraction - previous.probability) * 100;
  if (changePct === 0) return null;

  return { changePct, window: "latest tick" };
}

// Manifold's "group" (topic) slugs would be the closest thing to a native
// category, tried first via the shared keyword matcher (same pattern as
// Polymarket's tags) — but the live /v0/search-markets response has no
// groupSlugs field (see module header), so in practice this always falls
// through to question-text keyword matching. Left in place in case a
// different Manifold endpoint or response variant does include it.
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
// USD ($) for play-money markets — this string gets embedded directly in
// generated body text, so the distinction has to be explicit here, not left
// to UI styling alone. Manifold's rare CASH-token markets use real USD, so
// those get the normal "$" prefix instead.
function formatManifoldVolume(v: number, isPlayMoney: boolean): string {
  const prefix = isPlayMoney ? "M$" : "$";
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${prefix}${(v / 1_000).toFixed(0)}K`;
  return `${prefix}${v.toFixed(0)}`;
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
  isPlayMoney: boolean;
}): string {
  const {
    currentProbability,
    changePct,
    direction,
    volume,
    uniqueBettorCount,
    closeTime,
    isPlayMoney,
  } = params;
  const dir = direction === "up" ? "risen" : "fallen";
  const magnitude = Math.abs(changePct).toFixed(1);
  const bettorClause = uniqueBettorCount ? ` from ${uniqueBettorCount} traders` : "";
  const resolution = timeToResolution(closeTime);
  const currencyNote = isPlayMoney
    ? "Manifold uses play-money (Mana), not real currency — prices still reflect aggregated trader belief, but nothing is staked financially."
    : "This is one of Manifold's real-money markets (settled in USD), unlike most Manifold markets which use play-money Mana.";

  const bullets = [
    `Probability has ${dir} ${magnitude} percentage points since the last check, now pricing this outcome at ${currentProbability.toFixed(
      0
    )}%.`,
    `${formatManifoldVolume(volume, isPlayMoney)} in 24-hour trading activity${bettorClause}.`,
    currencyNote,
    `Scheduled to resolve ${resolution}.`,
  ];

  return bullets.join("\n");
}

// search-markets page size/pagination behavior wasn't verified live (see
// module header) — kept conservative and defensive: a short/empty page
// ends pagination naturally regardless of whether this exact size is right.
const MANIFOLD_PAGE_SIZE = 100;
const MANIFOLD_MAX_PAGES = 5;

export async function fetchManifold(): Promise<MarketMove[]> {
  const baseUrl = "https://api.manifold.markets/v0/search-markets";
  const moves: MarketMove[] = [];

  prunePreviousProbabilities();

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

        const best = computeManifoldChange(m.id, m.probability);
        if (!best) continue; // no prior snapshot yet, or too soon since the last one — see module header

        const currentProbability = m.probability * 100;
        const direction: "up" | "down" = best.changePct >= 0 ? "up" : "down";
        const volume = m.volume24Hours ?? 0;
        const liquidity = m.totalLiquidity ?? undefined;
        const category = classifyManifoldCategory(m.groupSlugs, m.question);
        const isPlayMoney = m.token !== "CASH";

        const body = templatedManifoldBody({
          title: m.question,
          currentProbability,
          changePct: best.changePct,
          direction,
          volume,
          uniqueBettorCount: m.uniqueBettorCount,
          closeTime: m.closeTime,
          window: best.window,
          isPlayMoney,
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
          isPlayMoney,
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
