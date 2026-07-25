import type { MarketMove } from "@shared/schema";

// ---------------------------------------------------------------------------
// Cross-platform market matching
//
// Polymarket and Kalshi share no common ID, so matching is entirely fuzzy:
// title-token overlap is the primary signal, backed up by category match,
// resolution-date proximity, and shared "entity" tokens (numbers, dates,
// proper nouns) that tend to disambiguate similarly-worded markets. This
// produces a confidence score per candidate pair, not a certainty — treat
// "high" confidence as "probably the same event, worth a human glance," not
// as ground truth.
// ---------------------------------------------------------------------------

// ---------------- Text normalization ----------------

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "will",
  "would", "does", "did", "do", "in", "on", "at", "by", "to", "of", "for",
  "with", "as", "and", "or", "but", "if", "this", "that", "these", "those",
  "it", "its", "from", "into", "over", "under", "above", "below", "than",
  "then", "market", "win", "wins", "happen", "occur", "before", "after",
  "during", "between", "who", "what", "when", "where", "which",
]);

function tokenize(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s%$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((t) => {
    if (b.has(t)) intersection++;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Rough proper-noun / entity extractor: capitalized words (excluding the
// title's first word, which is capitalized regardless of meaning) plus any
// token containing a digit (dates, percentages, dollar amounts). These tend
// to be the strongest disambiguators between two similarly-worded markets,
// e.g. "50bps" or "September" mattering more than generic overlap.
function extractEntities(title: string): Set<string> {
  const words = title.split(/\s+/);
  const entities = new Set<string>();
  words.forEach((w, i) => {
    const clean = w.replace(/[^\w.%$]/g, "");
    if (!clean) return;
    const isCapitalized = /^[A-Z]/.test(clean) && i > 0;
    const isNumericLike = /\d/.test(clean);
    if (isCapitalized || isNumericLike) entities.add(clean.toLowerCase());
  });
  return entities;
}

function sharedEntities(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = [];
  a.forEach((e) => {
    if (b.has(e)) shared.push(e);
  });
  return shared;
}

// ---------------- Date proximity ----------------

function dateProximityScore(
  a?: string | null,
  b?: string | null
): { score: number; diffDays: number | null } {
  if (!a || !b) return { score: 0, diffDays: null };
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return { score: 0, diffDays: null };
  const diffDays = Math.abs(ta - tb) / (1000 * 60 * 60 * 24);
  const score = Math.max(0, 1 - diffDays / 30); // linear falloff to 0 over 30 days apart
  return { score, diffDays: Math.round(diffDays * 10) / 10 };
}

// ---------------- Composite scoring ----------------

export interface CrossPlatformMatch {
  polymarketId: string;
  kalshiId: string;
  polymarketTitle: string;
  kalshiTitle: string;
  confidence: number; // 0-1
  tier: "high" | "medium" | "low";
  signals: {
    titleSimilarity: number;
    categoryMatch: boolean;
    dateProximityDays: number | null;
    sharedEntities: string[];
  };
}

// Pairs scoring below this are dropped entirely rather than surfaced as
// "very low confidence" — below this point the signal is closer to noise
// than to a real candidate.
const MIN_CONSIDER_THRESHOLD = 0.35;
const TIER_HIGH = 0.7;
const TIER_MEDIUM = 0.5;

function scorePair(pm: MarketMove, kx: MarketMove): CrossPlatformMatch | null {
  const titleSimilarity = jaccard(tokenize(pm.title), tokenize(kx.title));
  const categoryMatch = pm.category === kx.category;
  const { score: dateScore, diffDays } = dateProximityScore(pm.endDate, kx.endDate);
  const shared = sharedEntities(extractEntities(pm.title), extractEntities(kx.title));
  const entityBonus = shared.length > 0 ? Math.min(0.15, shared.length * 0.05) : 0;

  const confidence =
    titleSimilarity * 0.6 + (categoryMatch ? 0.15 : 0) + dateScore * 0.15 + entityBonus;

  if (confidence < MIN_CONSIDER_THRESHOLD) return null;

  const tier: CrossPlatformMatch["tier"] =
    confidence >= TIER_HIGH ? "high" : confidence >= TIER_MEDIUM ? "medium" : "low";

  return {
    polymarketId: pm.id,
    kalshiId: kx.id,
    polymarketTitle: pm.title,
    kalshiTitle: kx.title,
    confidence: Math.round(confidence * 100) / 100,
    tier,
    signals: {
      titleSimilarity: Math.round(titleSimilarity * 100) / 100,
      categoryMatch,
      dateProximityDays: diffDays,
      sharedEntities: shared,
    },
  };
}

// ---------------- Matching ----------------

// Greedy bipartite assignment: score every Polymarket x Kalshi pair, sort by
// confidence descending, then walk the list assigning each pair only if
// neither side has already been claimed by a stronger match. This isn't a
// globally optimal assignment (that would need the Hungarian algorithm), but
// at a few hundred markets per side the greedy result matches the optimal
// one closely enough in practice, for a fraction of the complexity.
export function matchCrossPlatform(
  polymarketMoves: MarketMove[],
  kalshiMoves: MarketMove[]
): CrossPlatformMatch[] {
  const candidates: CrossPlatformMatch[] = [];

  for (const pm of polymarketMoves) {
    for (const kx of kalshiMoves) {
      const match = scorePair(pm, kx);
      if (match) candidates.push(match);
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  const usedPolymarket = new Set<string>();
  const usedKalshi = new Set<string>();
  const matches: CrossPlatformMatch[] = [];

  for (const candidate of candidates) {
    if (usedPolymarket.has(candidate.polymarketId) || usedKalshi.has(candidate.kalshiId)) continue;
    matches.push(candidate);
    usedPolymarket.add(candidate.polymarketId);
    usedKalshi.add(candidate.kalshiId);
  }

  return matches;
}
