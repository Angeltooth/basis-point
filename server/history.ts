import type { HistoryPoint, MarketHistoryResponse } from "@shared/schema";

// ---------------------------------------------------------------------------
// Market price history (for the detail-panel chart)
//
// Fetched on demand when a user opens a market's detail dialog — not part
// of the periodic /api/movers cache, since fetching a full history series
// for every mover on every 3-minute refresh would be wasteful and slow.
//
// Each platform has a genuinely different story here:
//   - Kalshi: official, documented candlesticks endpoint
//     (docs.kalshi.com/api-reference/market/get-market-candlesticks).
//     Response shape verified against official first-party documentation.
//   - Polymarket: official CLOB /prices-history endpoint
//     (docs.polymarket.com/api-reference/markets/get-prices-history),
//     keyed by CLOB token ID rather than the market's own ID — requires an
//     extra Gamma lookup first to resolve that token ID. The exact response
//     JSON shape wasn't confirmed from a live call (this build environment
//     can't reach either domain), only that the endpoint and its query
//     params exist — code below handles a couple of plausible shapes
//     defensively and returns an empty series rather than guessing wrong.
//   - Manifold: has no first-party candlestick/history endpoint at all.
//     Reconstructed here from /v0/bets (each bet records probAfter at a
//     timestamp) — a real trade-by-trade history, just not pre-aggregated
//     by Manifold itself. Flagged to the client via `source: "bets"` so the
//     UI can caveat it differently from a real exchange candlestick series.
//
// FIELD VERIFICATION CAVEAT (same as the rest of this project's Manifold/
// pagination work): none of these three fetches could be tested against a
// live response from this build environment. Kalshi's shape comes from
// official first-party docs with a concrete example (highest confidence).
// Polymarket's endpoint/params are confirmed from official docs but the
// exact response wrapper is not (medium confidence). Manifold's /v0/bets
// shape is based on documented field names (createdTime, probAfter) used
// elsewhere in this project already. Verify against real responses before
// fully trusting any of these three — see the per-function comments below
// for the exact curl command to check each one.
// ---------------------------------------------------------------------------

const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // last 7 days

// ---------------- Polymarket ----------------

interface PolymarketMarketDetail {
  clobTokenIds?: string; // stringified JSON array, same convention as outcomes/outcomePrices elsewhere in this app
}

async function fetchPolymarketHistory(rawId: string): Promise<HistoryPoint[]> {
  // Verify: curl "https://gamma-api.polymarket.com/markets/<rawId>" | python3 -m json.tool
  const marketRes = await fetch(`https://gamma-api.polymarket.com/markets/${encodeURIComponent(rawId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!marketRes.ok) return [];
  const market: PolymarketMarketDetail = await marketRes.json();

  let tokenIds: string[] = [];
  try {
    tokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
  } catch {
    return [];
  }
  const yesTokenId = tokenIds[0];
  if (!yesTokenId) return [];

  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - Math.floor(HISTORY_WINDOW_MS / 1000);

  // Verify: curl "https://clob.polymarket.com/prices-history?market=<yesTokenId>&startTs=<startTs>&endTs=<endTs>&fidelity=60"
  const historyUrl = `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(
    yesTokenId
  )}&startTs=${startTs}&endTs=${endTs}&fidelity=60`;
  const historyRes = await fetch(historyUrl, { headers: { Accept: "application/json" } });
  if (!historyRes.ok) return [];
  const raw = await historyRes.json();

  // Handle a couple of plausible response shapes defensively rather than
  // assuming one — see module header caveat.
  const series: Array<{ t?: number; time?: number; p?: number; price?: number }> = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.history)
    ? raw.history
    : [];

  return series
    .map((point) => {
      const t = point.t ?? point.time;
      const p = point.p ?? point.price;
      if (typeof t !== "number" || typeof p !== "number") return null;
      return { timestamp: new Date(t * 1000).toISOString(), probability: p * 100 };
    })
    .filter((p): p is HistoryPoint => p !== null);
}

// ---------------- Kalshi ----------------

interface KalshiCandlestick {
  end_period_ts: number;
  price?: { close?: string; mean?: string };
}

interface KalshiCandlesticksResponse {
  candlesticks?: KalshiCandlestick[];
}

// Kalshi's URL embeds series_ticker and event_ticker, but the candlesticks
// endpoint needs series_ticker + the individual *market* ticker (which is
// what our move.id already encodes as `kx-${ticker}`) — event_ticker isn't
// the same thing as market ticker for markets with multiple strikes per
// event, so it's extracted from the URL rather than assumed identical.
function parseKalshiSeriesTicker(url: string): string | null {
  const match = url.match(/kalshi\.com\/markets\/([^/]+)\/[^/]+/);
  return match ? match[1] : null;
}

async function fetchKalshiHistory(rawTicker: string, url: string | undefined): Promise<HistoryPoint[]> {
  const seriesTicker = url ? parseKalshiSeriesTicker(url) : null;
  if (!seriesTicker) return [];

  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - Math.floor(HISTORY_WINDOW_MS / 1000);

  // Verify: curl "https://api.elections.kalshi.com/trade-api/v2/series/<seriesTicker>/markets/<rawTicker>/candlesticks?start_ts=<startTs>&end_ts=<endTs>&period_interval=60"
  const url2 = `https://api.elections.kalshi.com/trade-api/v2/series/${encodeURIComponent(
    seriesTicker
  )}/markets/${encodeURIComponent(rawTicker)}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=60`;
  const res = await fetch(url2, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data: KalshiCandlesticksResponse = await res.json();

  return (data.candlesticks ?? [])
    .map((c) => {
      const close = c.price?.close ?? c.price?.mean;
      if (!close) return null;
      const probability = parseFloat(close) * 100;
      if (Number.isNaN(probability)) return null;
      return { timestamp: new Date(c.end_period_ts * 1000).toISOString(), probability };
    })
    .filter((p): p is HistoryPoint => p !== null);
}

// ---------------- Manifold ----------------

interface ManifoldBet {
  createdTime: number;
  probAfter?: number;
}

async function fetchManifoldHistory(rawId: string): Promise<HistoryPoint[]> {
  // Verify: curl "https://api.manifold.markets/v0/bets?contractId=<rawId>&limit=1000"
  const url = `https://api.manifold.markets/v0/bets?contractId=${encodeURIComponent(rawId)}&limit=1000`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const bets: ManifoldBet[] = await res.json();
  if (!Array.isArray(bets)) return [];

  const cutoff = Date.now() - HISTORY_WINDOW_MS;

  return bets
    .filter((b) => typeof b.probAfter === "number" && b.createdTime >= cutoff)
    .sort((a, b) => a.createdTime - b.createdTime) // Manifold returns newest-first; chart wants chronological
    .map((b) => ({ timestamp: new Date(b.createdTime).toISOString(), probability: b.probAfter! * 100 }));
}

// ---------------- Dispatch ----------------

export async function getMarketHistory(params: {
  platform: string;
  id: string;
  url?: string;
}): Promise<MarketHistoryResponse> {
  const { platform, id, url } = params;

  if (platform === "polymarket") {
    const rawId = id.replace(/^pm-/, "");
    const points = await fetchPolymarketHistory(rawId);
    return { points, source: "prices-history" };
  }

  if (platform === "kalshi") {
    const rawTicker = id.replace(/^kx-/, "");
    const points = await fetchKalshiHistory(rawTicker, url);
    return { points, source: "candlesticks" };
  }

  if (platform === "manifold") {
    const rawId = id.replace(/^mf-/, "");
    const points = await fetchManifoldHistory(rawId);
    return { points, source: "bets" };
  }

  return { points: [], source: "candlesticks" };
}
