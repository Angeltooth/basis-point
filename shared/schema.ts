import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Unused persistence table retained from the template scaffold — this app
// is fully live-fetched/in-memory, no auth or DB persistence needed.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ---- Market Move types shared between server + client ----

export const CATEGORIES = [
  "Politics",
  "Sports",
  "Crypto & Business",
  "Entertainment & Culture",
  "Weather & Science",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const marketMoveSchema = z.object({
  id: z.string(),
  platform: z.enum(["polymarket", "kalshi", "manifold"]),
  title: z.string(),
  headline: z.string(),
  category: z.enum(CATEGORIES),
  currentProbability: z.number(),
  changePct: z.number(),
  direction: z.enum(["up", "down"]),
  window: z.string(),
  volume: z.number(),
  liquidity: z.number().optional(),
  url: z.string(),
  image: z.string().nullable().optional(),
  body: z.string(),
  // Marks when `body` is the platform's own copy reused verbatim (currently
  // only Polymarket's context_description) vs our own templated text — lets
  // the UI credit the source instead of presenting it as house-written.
  bodySource: z.enum(["generated", "polymarket"]).default("generated"),
  // True for Manifold moves: play-money (Mana), not real currency — the UI
  // must not present this volume/activity as equivalent to real-dollar
  // volume on Polymarket/Kalshi.
  isPlayMoney: z.boolean().default(false),
  endDate: z.string().nullable().optional(),
  updatedAt: z.string(),
});

export type MarketMove = z.infer<typeof marketMoveSchema>;

export const crossPlatformMatchSchema = z.object({
  polymarketId: z.string(),
  kalshiId: z.string(),
  polymarketTitle: z.string(),
  kalshiTitle: z.string(),
  confidence: z.number(),
  tier: z.enum(["high", "medium", "low"]),
  signals: z.object({
    titleSimilarity: z.number(),
    categoryMatch: z.boolean(),
    dateProximityDays: z.number().nullable(),
    sharedEntities: z.array(z.string()),
  }),
});

export type CrossPlatformMatch = z.infer<typeof crossPlatformMatchSchema>;

export const moversResponseSchema = z.object({
  movers: z.array(marketMoveSchema),
  extremeMovers: z.array(marketMoveSchema),
  crossPlatformMatches: z.array(crossPlatformMatchSchema),
  lastUpdated: z.string(),
  sourceCounts: z.object({
    polymarket: z.number(),
    kalshi: z.number(),
    manifold: z.number(),
  }),
});

export type MoversResponse = z.infer<typeof moversResponseSchema>;
