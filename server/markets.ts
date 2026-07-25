import type { Category, MarketMove } from "@shared/schema";
import { matchCrossPlatform, type CrossPlatformMatch } from "./matching";

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

interface MoversCache {
  movers: MarketMove[];
  extremeMovers: MarketMove[];
  crossPlatformMatches: CrossPlatformMatch[];
  lastUpdated: string;
  sourceCounts: { polymarket: number; kalshi: number };
}

let cache: MoversCache | null = null;
let cacheTimestamp = 0;
let inflightFetch: Promise<MoversCache> | null = null;

// ---------------- Category classification ----------------

const CATEGORY_RULES: Array<{ category: Category; keywords: RegExp }> = [
  {
    category: "Politics",
    keywords:
      /\b(election|president|senate|congress|governor|mayor|vote|poll|democrat|republican|gop|impeach|nominee|primary|shutdown|legislation|supreme court|cabinet|prime minister|parliament|referendum|policy|white house|administration|geopolitic|war in|ceasefire|sanctions|nato|trump|biden|harris|putin|zelensky|xi jinping)\b/i,
  },
  {
    category: "Sports",
    keywords:
      /\b(nfl|nba|nhl|mlb|ufc|mma|boxing|premier league|la liga|champions league|world cup|olympics|tennis|golf|pga|f1|formula 1|nascar|super bowl|playoffs|match|tournament|esports|league of legends|dota|csgo|valorant|game \d|vs\.?|wins the|championship)\b/i,
  },
  {
    category: "Crypto & Business",
    keywords:
      /\b(bitcoin|btc|ethereum|eth|crypto|solana|sol|dogecoin|xrp|stablecoin|sec\b|federal reserve|fed\b|interest rate|inflation|cpi|gdp|stock|nasdaq|s&p|ipo|earnings|merger|acquisition|bankruptcy|tesla|apple|nvidia|amazon|google|meta|microsoft|market cap|recession|tariff|oil price|opec)\b/i,
  },
  {
    category: "Entertainment & Culture",
    keywords:
      /\b(movie|film|box office|oscar|grammy|emmy|album|celebrity|taylor swift|kanye|drake|netflix|hbo|disney|tv show|season finale|reality show|award show|singer|actor|actress|billboard|streaming|kardashian)\b/i,
  },
  {
    category: "Weather & Science",
    keywords:
      /\b(hurricane|storm|weather|temperature|climate|earthquake|wildfire|nasa|spacex|rocket launch|space station|vaccine|pandemic|virus|outbreak|scientific|research study|nobel prize|ai model|artificial intelligence|openai|anthropic|agi)\b/i,
  },
];

function classifyCategory(title: string): Category {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(title)) return rule.category;
  }
  return "Other";
}

// ---------------- Headline generation ----------------

function verbFor(direction: "up" | "down", magnitude: number): string {
  if (direction === "up") {
    if (magnitude >= 20) return "surges to";
    if (magnitude >= 10) return "jumps to";
    if (magnitude >= 5) return "climbs to";
    return "edges up to";
  } else {
    if (magnitude >= 20) return "plunges to";
    if (magnitude >= 10) return "slides to";
    if (magnitude >= 5) return "slips to";
    return "edges down to";
  }
}

function windowLabel(window: string): string {
  switch (window) {
    case "1h":
      return "1h";
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

function buildHeadline(
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
  return `${cleanTitle}: probability ${verb} ${currentProbability.toFixed(0)}% (${sign}${magnitude.toFixed(1)}pp in ${windowLabel(
    window
  )})`;
}

// ---------------- Body text templating ----------------

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function timeToResolution(endDate: string | null | undefined): string {
  if (!endDate) return "an undetermined date";
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diffMs = end - now;
  if (diffMs <= 0) return "imminently";
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 1) return "within 24 hours";
  if (days < 2) return "tomorrow";
  if (days < 14) return `in ${Math.round(days)} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

function templatedBody(params: {
  platform: "polymarket" | "kalshi";
  title: string;
  currentProbability: number;
  changePct: number;
  direction: "up" | "down";
  volume: number;
  liquidity?: number;
  endDate?: string | null;
  window: string;
}): string {
  const { platform, title, currentProbability, changePct, direction, volume, liquidity, endDate, window } =
    params;
  const platformName = platform === "polymarket" ? "Polymarket" : "Kalshi";
  const dir = direction === "up" ? "risen" : "fallen";
  const magnitude = Math.abs(changePct).toFixed(1);
  const liquidityClause = liquidity
    ? ` with roughly ${formatVolume(liquidity)} in market liquidity`
    : "";
  const resolution = timeToResolution(endDate);

  return `Traders on ${platformName} have pushed the probability of "${title}" ${dir} by ${magnitude} percentage points over the past ${windowLabel(
    window
  )}, with the market now pricing this outcome at ${currentProbability.toFixed(
    0
  )}%. The move came alongside ${formatVolume(
    volume
  )} in 24-hour trading volume${liquidityClause}, signaling active repricing from the crowd. The market is scheduled to resolve ${resolution}. As with all prediction markets, current prices reflect the crowd's live best estimate of the odds — not a certainty — and can continue to shift as new information arrives before resolution.`;
}

// ---------------- Polymarket ----------------

interface PolymarketEventMeta {
  context_description?: string;
}
interface PolymarketEvent {
  title?: string;
  slug?: string;
  eventMetadata?: PolymarketEventMeta;
}
interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomes?: string;
  outcomePrices?: string;
  oneHourPriceChange?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
  lastTradePrice?: number;
  volume24hr?: number;
  liquidity?: string | number;
  image?: string;
  endDate?: string;
  events?: PolymarketEvent[];
}

function pickBestWindow(m: PolymarketMarket): { changePct: number; window: string } | null {
  const windows: Array<[number | undefined, string]> = [
    [m.oneHourPriceChange, "1h"],
    [m.oneDayPriceChange, "24h"],
    [m.oneWeekPriceChange, "7d"],
    [m.oneMonthPriceChange, "30d"],
  ];
  let best: { changePct: number; window: string } | null = null;
  for (const [val, label] of windows) {
    if (typeof val === "number" && !Number.isNaN(val)) {
      const pct = val * 100;
      if (!best || Math.abs(pct) > Math.abs(best.changePct)) {
        best = { changePct: pct, window: label };
      }
    }
  }
  return best;
}

function processPolymarketMarket(m: PolymarketMarket): MarketMove | null {
  const best = pickBestWindow(m);
  if (!best || best.changePct === 0) return null;

  let outcomes: string[] = [];
  let outcomePrices: string[] = [];
  try {
    outcomes = m.outcomes ? JSON.parse(m.outcomes) : [];
    outcomePrices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
  } catch {
    // ignore parse errors
  }

  const yesPrice =
    typeof m.lastTradePrice === "number"
      ? m.lastTradePrice
      : outcomePrices.length > 0
      ? parseFloat(outcomePrices[0])
      : undefined;
  if (yesPrice === undefined || Number.isNaN(yesPrice)) return null;

  const currentProbability = yesPrice * 100;
  const direction: "up" | "down" = best.changePct >= 0 ? "up" : "down";

  const event = m.events?.[0];
  const title = event?.title || m.question;
  const eventSlug = event?.slug || m.slug;
  const contextDescription = event?.eventMetadata?.context_description;

  const volume = m.volume24hr ?? 0;
  const liquidity = typeof m.liquidity === "string" ? parseFloat(m.liquidity) : m.liquidity ?? undefined;

  const isVerbatim = !!contextDescription && contextDescription.trim().length > 20;
  const body = isVerbatim
    ? contextDescription!.trim()
    : templatedBody({
        platform: "polymarket",
        title,
        currentProbability,
        changePct: best.changePct,
        direction,
        volume,
        liquidity,
        endDate: m.endDate,
        window: best.window,
      });
  const bodySource: "generated" | "polymarket" = isVerbatim ? "polymarket" : "generated";

  return {
    id: `pm-${m.id}`,
    platform: "polymarket",
    title,
    headline: buildHeadline(title, currentProbability, best.changePct, direction, best.window),
    category: classifyCategory(`${title} ${outcomes.join(" ")}`),
    currentProbability,
    changePct: best.changePct,
    direction,
    window: best.window,
    volume,
    liquidity,
    url: `https://polymarket.com/event/${eventSlug}`,
    image: m.image || null,
    body,
    bodySource,
    endDate: m.endDate || null,
    updatedAt: new Date().toISOString(),
  };
}

// Gamma API's `limit` is a page size, not a hard ceiling — the original
// single-request fetch (limit=150, no pagination) meant anything outside the
// top 150 markets by 24h volume was invisible to Basis Point regardless of
// how much its probability had moved. Paginating via `offset` fixes that.
// MAX_PAGES bounds total requests/latency in case the API ever returns more
// pages than expected; a short/empty page ends pagination naturally before
// that cap is reached in the common case.
const POLYMARKET_PAGE_SIZE = 150;
const POLYMARKET_MAX_PAGES = 5; // up to ~750 markets, ordered by 24h volume desc

async function fetchPolymarket(): Promise<MarketMove[]> {
  const baseUrl = "https://gamma-api.polymarket.com/markets";
  const moves: MarketMove[] = [];

  for (let page = 0; page < POLYMARKET_MAX_PAGES; page++) {
    const offset = page * POLYMARKET_PAGE_SIZE;
    const url = `${baseUrl}?limit=${POLYMARKET_PAGE_SIZE}&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      // A hiccup partway through pagination shouldn't discard everything
      // already fetched on earlier pages — only the very first page failing
      // is treated as a hard failure (mirrors the Kalshi fetch's behaviour).
      if (page === 0) throw new Error(`Polymarket fetch failed: ${res.status}`);
      break;
    }
    const data: PolymarketMarket[] = await res.json();
    if (data.length === 0) break;

    for (const m of data) {
      try {
        const move = processPolymarketMarket(m);
        if (move) moves.push(move);
      } catch {
        // skip malformed market entries
        continue;
      }
    }

    if (data.length < POLYMARKET_PAGE_SIZE) break; // short page means no more data
  }

  return moves;
}

// ---------------- Kalshi ----------------

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_sub_title?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  volume_24h_fp?: string;
  liquidity_dollars?: string;
  close_time?: string;
  status?: string;
  custom_strike?: Record<string, unknown>;
}

interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  category?: string;
  title: string;
  markets?: KalshiMarket[];
}

// Kalshi's own event `category` field maps directly onto our buckets —
// no keyword-guessing needed for Kalshi content.
const KALSHI_CATEGORY_MAP: Record<string, Category> = {
  Elections: "Politics",
  Politics: "Politics",
  World: "Other",
  Sports: "Sports",
  Financials: "Crypto & Business",
  Economics: "Crypto & Business",
  Companies: "Crypto & Business",
  Entertainment: "Entertainment & Culture",
  Social: "Entertainment & Culture",
  "Climate and Weather": "Weather & Science",
  "Science and Technology": "Weather & Science",
  Health: "Weather & Science",
  Transportation: "Other",
};

function classifyKalshiCategory(rawCategory: string | undefined): Category {
  if (!rawCategory) return "Other";
  return KALSHI_CATEGORY_MAP[rawCategory] ?? "Other";
}

function isComboMarket(m: KalshiMarket): boolean {
  if (m.ticker.includes("MVE")) return true;
  if (m.custom_strike && Object.keys(m.custom_strike).length > 0) return true;
  // titles with multiple comma-separated clauses (rough heuristic: 2+ commas)
  if ((m.title.match(/,/g) || []).length >= 2) return true;
  return false;
}

async function fetchKalshi(): Promise<MarketMove[]> {
  // The events endpoint (with nested markets + a proper category field) returns
  // clean single-question markets, unlike the generic /markets listing which is
  // currently saturated with auto-generated multivariate (MVE) combo bundles.
  const baseUrl =
    "https://api.elections.kalshi.com/trade-api/v2/events?limit=200&status=open&with_nested_markets=true";
  const moves: MarketMove[] = [];

  let cursor: string | undefined;
  // Previously this loop also broke early once `moves.length >= 200`, which
  // in practice fired well before MAX_PAGES was reached — so the effective
  // limit was "however many events it takes to find 200 qualifying moves,"
  // not a real sweep of what's open. MAX_PAGES alone now governs how much
  // is fetched; raised alongside removing that early-exit to actually cover
  // meaningfully more of the open market than before.
  const MAX_PAGES = 6;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = cursor ? `${baseUrl}&cursor=${encodeURIComponent(cursor)}` : baseUrl;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      if (page === 0) throw new Error(`Kalshi fetch failed: ${res.status}`);
      break;
    }
    const data: { events: KalshiEvent[]; cursor?: string } = await res.json();

    for (const event of data.events ?? []) {
      const category = classifyKalshiCategory(event.category);

      for (const m of event.markets ?? []) {
        try {
          if (m.status !== "active") continue;
          if (isComboMarket(m)) continue;

          const last = parseFloat(m.last_price_dollars ?? "");
          const prev = parseFloat(m.previous_price_dollars ?? "");
          if (Number.isNaN(last) || Number.isNaN(prev)) continue;

          const changePct = (last - prev) * 100;
          if (changePct === 0) continue;

          const volume = parseFloat(m.volume_24h_fp ?? "0") || 0;
          const liquidity = parseFloat(m.liquidity_dollars ?? "0") || 0;
          // Skip dead/illiquid markets so headlines reflect real repricing.
          if (volume <= 0 && liquidity <= 0) continue;

          const currentProbability = last * 100;
          const direction: "up" | "down" = changePct >= 0 ? "up" : "down";
          const title = m.title || event.title;

          const body = templatedBody({
            platform: "kalshi",
            title,
            currentProbability,
            changePct,
            direction,
            volume,
            liquidity,
            endDate: m.close_time,
            window: "latest tick",
          });

          moves.push({
            id: `kx-${m.ticker}`,
            platform: "kalshi",
            title,
            headline: buildHeadline(title, currentProbability, changePct, direction, "latest tick"),
            category,
            currentProbability,
            changePct,
            direction,
            window: "latest tick",
            volume,
            liquidity,
            url: `https://kalshi.com/markets/${event.series_ticker}/${event.event_ticker}`,
            image: null,
            body,
            bodySource: "generated" as const,
            endDate: m.close_time || null,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          continue;
        }
      }
    }

    cursor = data.cursor;
    if (!cursor) break; // no more pages
  }

  return moves;
}

// ---------------- Aggregation ----------------

// Composite ranking score: raw magnitude alone lets a market that moved 60pp
// on a single small trade outrank a market that moved 20pp on heavy, genuine
// trading. Scaling by log10(activity) keeps big swings on top while damping
// the influence of thin/illiquid markets, without hard-filtering them out
// (a still-interesting 40pp move on modest volume stays visible, just ranked
// below a 40pp move backed by real size).
const ACTIVITY_FLOOR = 10; // avoids log(0)/log(negative-ish) blowups and stops
// near-zero-volume markets from getting an outsized score just because the
// floor is small (e.g. log10(10) = 1 rather than log10(0.01) = -2).

// Kalshi's "latest tick" figure is (last - prev) between the two most recent
// trades, which could be seconds or minutes apart — it carries much less
// evidence of a real trend than a Polymarket window that's genuinely 1h/24h/
// 7d/30d wide. Without this, a 15pp single-trade blip ranks identically to a
// 15pp move sustained over a full day. INSTANT_TICK_DISCOUNT down-weights
// tick-only moves in the ranking; it does not hide them.
const INSTANT_TICK_DISCOUNT = 0.55;

function rankScore(m: MarketMove): number {
  const magnitude = Math.abs(m.changePct);
  const activity = (m.volume || 0) + (m.liquidity || 0);
  const windowConfidence = m.window === "latest tick" ? INSTANT_TICK_DISCOUNT : 1;
  return magnitude * Math.log10(activity + ACTIVITY_FLOOR) * windowConfidence;
}

async function computeMovers() {
  const [polymarketMoves, kalshiMoves] = await Promise.all([
    fetchPolymarket().catch((err) => {
      console.error("Polymarket fetch error:", err);
      return [] as MarketMove[];
    }),
    fetchKalshi().catch((err) => {
      console.error("Kalshi fetch error:", err);
      return [] as MarketMove[];
    }),
  ]);

  const all = [...polymarketMoves, ...kalshiMoves];
  all.sort((a, b) => rankScore(b) - rankScore(a));

  // No cap here by design — every market that changed price and passed the
  // upstream filters (combo/dead-market exclusion, volume/liquidity floor)
  // shows up, sorted by rankScore. extremeMovers stays capped at 10: it's a
  // distinct "highlights" ticker, not the main feed, and an uncapped
  // scrolling marquee would defeat its purpose.
  const movers = all;
  const extremeMovers = all.slice(0, 10);

  // Matched against the full fetched sets, not just the top-60 slice above —
  // a match can exist between two markets that individually didn't move
  // enough to rank in "movers" this cycle.
  const crossPlatformMatches = matchCrossPlatform(polymarketMoves, kalshiMoves);

  return {
    movers,
    extremeMovers,
    crossPlatformMatches,
    lastUpdated: new Date().toISOString(),
    sourceCounts: {
      polymarket: polymarketMoves.length,
      kalshi: kalshiMoves.length,
    },
  };
}

export async function getMovers(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cache && now - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }
  if (inflightFetch) {
    return inflightFetch;
  }
  inflightFetch = computeMovers()
    .then((result) => {
      cache = result;
      cacheTimestamp = Date.now();
      return result;
    })
    .finally(() => {
      inflightFetch = null;
    });
  return inflightFetch;
}
