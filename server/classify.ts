import type { Category } from "@shared/schema";

// ---------------------------------------------------------------------------
// Shared category classification
//
// Used two ways across platforms:
//   1. As a fallback when a platform doesn't hand us a clean native category
//      (Polymarket title text when no tag matched; Kalshi's raw category
//      string when it's not in that platform's explicit map).
//   2. As the primary signal against short tag/label strings (a Polymarket
//      tag name, a Manifold group slug) rather than full sentences.
//
// classifyKeywords() returns null when nothing matches, rather than
// defaulting to "Other" — that distinction matters to callers who want to
// know "we have a real signal" vs. "we're falling back to a default,"
// e.g. trying several tags in priority order before giving up.
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORD_RULES: Array<{ category: Category; keywords: RegExp }> = [
  {
    category: "Politics",
    keywords:
      /\b(elections?|president|senate|congress|governor|mayor|vote|poll|democrat|republican|gop|impeach|nominee|primary|shutdown|legislation|supreme court|cabinet|prime minister|parliament|referendum|policy|white house|administration|geopolitic|war in|ceasefire|sanctions|nato|trump|biden|harris|putin|zelensky|xi jinping|politics)\b/i,
  },
  {
    category: "Sports",
    keywords:
      /\b(nfl|nba|nhl|mlb|ufc|mma|boxing|premier league|la liga|champions league|world cup|olympics|tennis|golf|pga|f1|formula 1|nascar|super bowl|playoffs|match|tournament|esports|league of legends|dota|csgo|valorant|game \d|vs\.?|wins the|championship|sports?)\b/i,
  },
  {
    category: "Crypto & Business",
    keywords:
      /\b(bitcoin|btc|ethereum|eth|crypto|solana|sol|dogecoin|xrp|stablecoin|sec\b|federal reserve|fed\b|interest rate|inflation|cpi|gdp|stock|nasdaq|s&p|ipo|earnings|merger|acquisition|bankruptcy|tesla|apple|nvidia|amazon|google|meta|microsoft|market cap|recession|tariff|oil price|opec|business|econom(y|ics)|financ(e|ials?)|compan(y|ies))\b/i,
  },
  {
    category: "Entertainment & Culture",
    keywords:
      /\b(movie|film|box office|oscar|grammy|emmy|album|celebrity|taylor swift|kanye|drake|netflix|hbo|disney|tv show|season finale|reality show|award show|singer|actor|actress|billboard|streaming|kardashian|entertainment|culture|pop culture|music|social)\b/i,
  },
  {
    category: "Weather & Science",
    keywords:
      /\b(hurricane|storm|weather|temperature|climate|earthquake|wildfire|nasa|spacex|rocket launch|space station|vaccine|pandemic|virus|outbreak|scientific|research study|nobel prize|ai model|artificial intelligence|openai|anthropic|agi|science|technology|tech\b|health)\b/i,
  },
];

export function classifyKeywords(text: string): Category | null {
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (rule.keywords.test(text)) return rule.category;
  }
  return null;
}

export function classifyKeywordsWithDefault(text: string): Category {
  return classifyKeywords(text) ?? "Other";
}
