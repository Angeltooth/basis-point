# Basis Point

A prediction-market news dashboard that turns live price movements on [Polymarket](https://polymarket.com) and [Kalshi](https://kalshi.com) into auto-generated news headlines. No editors, no delay — just the odds moving, presented as short news-style cards with a scrolling ticker of the most extreme swings.

**Live demo:** https://basis-point.pplx.app

> This is a quick prototype built to demonstrate the concept — simple design, core functionality, not a polished public launch. See [Known Limitations](#known-limitations) below.

---

## What It Does

- Fetches live market data from Polymarket's Gamma API and Kalshi's public Trade API
- Calculates which markets have moved the most (probability delta over the last tick/day)
- Auto-generates a news-style headline for each notable mover (e.g. *"probability surges to 99% (+65.0pp)"*)
- Displays everything in a dark editorial UI: scrolling ticker of extreme movers, filterable card grid, category tabs (Politics, Sports, Crypto & Business, Entertainment & Culture, Weather & Science, Other), and a detail dialog linking back to the live market on its source platform
- Auto-refreshes every 2–3 minutes via React Query; manual refresh also available
- Light/dark mode toggle

## Tech Stack

Express + Vite + React + TypeScript + Tailwind CSS + shadcn/ui + Drizzle ORM (SQLite), following Perplexity's fullstack webapp template conventions.

```
├── client/src/           React frontend (pages, components, hooks, lib)
├── server/
│   ├── index.ts          Express entrypoint
│   ├── routes.ts         Registers GET /api/movers
│   ├── markets.ts        Core logic: fetches + normalizes Polymarket & Kalshi data
│   ├── storage.ts        Drizzle/SQLite wiring (data.db)
│   └── static.ts/vite.ts Static file serving / dev server glue
├── shared/schema.ts      Shared types (MarketMove, etc.)
└── script/build.ts       Production build script
```

## Getting Started

```bash
npm install
npm run dev
```

This starts the Express backend and Vite frontend on the same port (default `5000`). Open `http://localhost:5000`.

### Production build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Data Sources

### Polymarket — Gamma API (no auth required)

```
GET https://gamma-api.polymarket.com/markets?limit=150&active=true&closed=false&order=volume24hr&ascending=false
```

Uses `question`, `outcomePrices`, `oneHourPriceChange`/`oneDayPriceChange`/etc., `lastTradePrice`, `volume24hr`, `liquidity`, and `events[0].eventMetadata.context_description` (Polymarket's own pre-written blurb, used directly as article body — no LLM needed).

### Kalshi — Trade API (no auth required for reads)

```
GET https://api.elections.kalshi.com/trade-api/v2/events?limit=200&status=open&with_nested_markets=true
```

Returns clean single-question markets nested under events, each carrying a native `category` field mapped directly onto the app's category buckets.

> **Gotcha:** the generic `/markets?status=open` listing is *not* usable — it's dominated by auto-generated multivariate combo/parlay markets (`event_ticker` starting with `KXMVE`) that don't represent real single-question odds. Always use the `/events?with_nested_markets=true` endpoint above instead.

## Known Limitations

This is a prototype, not a production app:

- **Persistence:** the local SQLite file (`data.db`) is used only as a short-lived server cache of fetched market data, not durable storage. It resets on restart/redeploy.
- **No AI-written commentary:** headlines are template-generated from price deltas rather than LLM-composed prose.
- **No historical charts** — only current movers, no trend lines over time.
- **Cache window:** ~2–3 minutes, so headlines can lag slightly behind live odds.

## Deployment

Deployed via Perplexity Computer's website-publishing tooling to a permanent `pplx.app` URL. No LLM/AI API calls or external tool connectors are used at runtime, so the app runs unmodified in that environment.

## License

Private prototype — no license specified.
