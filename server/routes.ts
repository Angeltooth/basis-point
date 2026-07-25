import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import { getMovers } from "./markets";
import { getMarketHistory } from "./history";
import type { HistoryRange } from "@shared/schema";
import { HISTORY_RANGES } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // prefix all routes with /api

  app.get("/api/movers", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true";
      const data = await getMovers(forceRefresh);
      res.json(data);
    } catch (err) {
      console.error("Error fetching movers:", err);
      res.status(500).json({ error: "Failed to fetch market movers" });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const platform = req.query.platform;
      const id = req.query.id;
      const url = req.query.url;
      const range = req.query.range;
      if (typeof platform !== "string" || typeof id !== "string") {
        return res.status(400).json({ error: "platform and id query params are required" });
      }
      const rangeParam = typeof range === "string" && (HISTORY_RANGES as readonly string[]).includes(range)
        ? (range as HistoryRange)
        : undefined;
      const data = await getMarketHistory({
        platform,
        id,
        url: typeof url === "string" ? url : undefined,
        range: rangeParam,
      });
      res.json(data);
    } catch (err) {
      console.error("Error fetching market history:", err);
      res.status(500).json({ error: "Failed to fetch market history" });
    }
  });

  return httpServer;
}
