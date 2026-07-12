import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import { getMovers } from "./markets";

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

  return httpServer;
}
