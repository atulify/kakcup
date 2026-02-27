// No bcryptjs here — kept in server/password.ts so this file is Edge-compatible.
import { sign, verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import type { Year } from "../shared/schema.js";

export type AppEnv = {
  Variables: {
    userId: string;
    role: string;
    username: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    year?: Year;
  };
};

const JWT_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "dev-secret";

type JWTClaims = {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  exp: number;
};

export async function createToken(claims: Omit<JWTClaims, "exp">): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  return sign({ ...claims, exp }, JWT_SECRET, "HS256");
}

async function getPayload(c: Context): Promise<JWTClaims | null> {
  const token = getCookie(c, "token");
  if (!token) return null;
  try {
    return (await verify(token, JWT_SECRET, "HS256")) as unknown as JWTClaims;
  } catch {
    return null;
  }
}

function setVarsFromPayload(c: Context<AppEnv>, payload: JWTClaims) {
  c.set("userId", payload.userId);
  c.set("role", payload.role);
  c.set("username", payload.username);
  c.set("email", payload.email);
  c.set("firstName", payload.firstName);
  c.set("lastName", payload.lastName);
}

export const isAuthenticated: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = await getPayload(c);
  if (!payload) return c.json({ message: "Unauthorized" }, 401);
  setVarsFromPayload(c, payload);
  await next();
};

export const isAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const payload = await getPayload(c);
  if (!payload) return c.json({ message: "Unauthorized" }, 401);
  if (payload.role !== "admin") return c.json({ message: "Admin access required" }, 403);
  setVarsFromPayload(c, payload);
  await next();
};

