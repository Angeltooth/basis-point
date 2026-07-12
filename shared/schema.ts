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
  platform: z.enum(["polymarket", "kalshi"]),
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
  endDate: z.string().nullable().optional(),
  updatedAt: z.string(),
});

export type MarketMove = z.infer<typeof marketMoveSchema>;

export const moversResponseSchema = z.object({
  movers: z.array(marketMoveSchema),
  extremeMovers: z.array(marketMoveSchema),
  lastUpdated: z.string(),
  sourceCounts: z.object({
    polymarket: z.number(),
    kalshi: z.number(),
  }),
});

export type MoversResponse = z.infer<typeof moversResponseSchema>;
