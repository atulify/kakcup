// Node.js runtime — bcryptjs (used for password hashing) requires Node.js crypto.
// Implemented directly against VercelRequest/VercelResponse to avoid all
// Node.js ↔ Web Fetch API adapter issues (body stream consumption, etc.).

// hono/jwt uses globalThis.crypto.subtle (Web Crypto API). Node.js 18+ sets this
// globally; polyfill for older Node.js runtimes.
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { storage } from "../server/storage.js";
import { hashPassword, verifyPassword } from "../server/password.js";
import { createToken } from "../server/auth.js";
import { verify } from "hono/jwt";

const JWT_SECRET =
  process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "dev-secret";
const isProd = process.env.NODE_ENV === "production";

function tokenCookie(token: string) {
  return `token=${token}; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=604800`;
}

function clearCookie() {
  return `token=; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0`;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=").trim()];
    })
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Strip the ?path=… query param Vercel appends from rewrite captures
  const path = (req.url ?? "/").split("?")[0];
  const method = (req.method ?? "GET").toUpperCase();

  // ── POST /api/auth/login ─────────────────────────────────────────────────
  if (method === "POST" && path === "/api/auth/login") {
    try {
      const rawBody = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", () => resolve("[stream error]"));
      });
      const { username, password } = JSON.parse(rawBody || "{}") as any;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user?.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!(await verifyPassword(password, user.passwordHash))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = await createToken({
        userId: user.id,
        username: user.username ?? "",
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });
      res.setHeader("Set-Cookie", tokenCookie(token));
      const { passwordHash, ...userData } = user;
      return res.status(200).json(userData);
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }

  // ── POST /api/auth/register ──────────────────────────────────────────────
  if (method === "POST" && path === "/api/auth/register") {
    try {
      const { username, email, password, firstName, lastName } = req.body ?? {};
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      if (await storage.getUserByUsername(username)) {
        return res.status(409).json({ message: "Username already exists" });
      }
      if (email && (await storage.getUserByEmail(email))) {
        return res.status(409).json({ message: "Email already exists" });
      }
      const passwordHash = await hashPassword(password);
      const newUser = await storage.createUser({
        username, email, passwordHash, firstName, lastName, role: "user",
      });
      const token = await createToken({
        userId: newUser.id,
        username: newUser.username ?? "",
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      });
      res.setHeader("Set-Cookie", tokenCookie(token));
      const { passwordHash: _, ...userData } = newUser;
      return res.status(200).json(userData);
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }

  // ── POST /api/auth/logout ────────────────────────────────────────────────
  if (method === "POST" && path === "/api/auth/logout") {
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ message: "Logged out successfully" });
  }

  // ── GET /api/auth/user ───────────────────────────────────────────────────
  if (method === "GET" && path === "/api/auth/user") {
    try {
      const cookies = parseCookies(
        (req.headers.cookie as string | undefined) ?? ""
      );
      const token = cookies["token"];
      if (!token) return res.status(401).json({ message: "Unauthorized" });
      const payload = (await verify(token, JWT_SECRET, "HS256")) as any;
      return res.status(200).json({
        id: payload.userId,
        username: payload.username,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        role: payload.role,
      });
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  return res.status(404).json({ message: "Not found" });
}
