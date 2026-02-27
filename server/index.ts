import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createRoutes } from "./routes.js";
import { initializeDatabase } from "./init-db.js";
import type { AppEnv } from "./auth.js";

// Local dev SQLite setup — only runs when DATABASE_URL is not set
// Must happen before any route handlers are invoked so storage.ts sees the correct db
if (!process.env.DATABASE_URL) {
  const [{ drizzle }, { default: Database }, schema, { setDb }] = await Promise.all([
    import("drizzle-orm/better-sqlite3"),
    import("better-sqlite3"),
    import("../shared/schema.js"),
    import("./db.js"),
  ]);
  const sqlite = new Database("./kakcup.db");
  setDb(drizzle(sqlite, { schema }));
}

await initializeDatabase();

const app = new Hono<AppEnv>();
createRoutes(app);

const port = parseInt(process.env.PORT ?? "3000", 10);
serve({ fetch: app.fetch, port });
console.log(`API server running on http://localhost:${port}`);
