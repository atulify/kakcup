// Vercel Edge Runtime — data routes only (no bcryptjs in import chain).
// Auth routes (/api/auth/*) are handled by api/auth.ts (Node.js).
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createDataRoutes } from "../server/data-routes.js";
import type { AppEnv } from "../server/auth.js";

export const config = { runtime: "edge" };

const app = new Hono<AppEnv>();
createDataRoutes(app);
const honoHandler = handle(app);

// Vercel strips /api prefix — restore it for Hono routing
export default async function handler(req: Request) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api")) {
    url.pathname = "/api" + url.pathname;
    req = new Request(url.toString(), req);
  }
  return honoHandler(req);
}
