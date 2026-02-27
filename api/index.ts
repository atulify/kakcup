import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createRoutes } from "../server/routes.js";
import type { AppEnv } from "../server/auth.js";

// Phase 3: Vercel Edge Runtime — ~0ms cold start via V8 isolates
export const config = { runtime: "edge" };

const app = new Hono<AppEnv>();
createRoutes(app);
const honoHandler = handle(app);

// Vercel strips /api prefix when routing to api/index — restore it for Hono routing
export default async function handler(req: Request) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api")) {
    url.pathname = "/api" + url.pathname;
    req = new Request(url.toString(), req);
  }
  return honoHandler(req);
}
