// Combined routes for local dev (server/index.ts).
// Production Vercel functions import auth-routes.ts / data-routes.ts directly.
import type { Hono } from "hono";
import type { AppEnv } from "./auth.js";
import { createAuthRoutes } from "./auth-routes.js";
import { createDataRoutes } from "./data-routes.js";

export function createRoutes(app: Hono<AppEnv>): void {
  createAuthRoutes(app);
  createDataRoutes(app);
}
