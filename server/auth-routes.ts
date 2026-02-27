import type { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { storage } from "./storage.js";
import { isAuthenticated, createToken, type AppEnv } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";

export function createAuthRoutes(app: Hono<AppEnv>): void {
  const isProd = process.env.NODE_ENV === "production";

  app.post("/api/auth/login", async (c) => {
    try {
      const { username, password } = await c.req.json();
      if (!username || !password) {
        return c.json({ message: "Username and password required" }, 400);
      }

      const user = await storage.getUserByUsername(username);
      if (!user || !user.passwordHash) {
        return c.json({ message: "Invalid credentials" }, 401);
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return c.json({ message: "Invalid credentials" }, 401);
      }

      const token = await createToken({
        userId: user.id,
        username: user.username ?? "",
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });

      setCookie(c, "token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      const { passwordHash, ...userData } = user;
      return c.json(userData);
    } catch (error) {
      console.error("Login error:", error);
      return c.json({ message: "Server error" }, 500);
    }
  });

  app.post("/api/auth/register", async (c) => {
    try {
      const { username, email, password, firstName, lastName } = await c.req.json();
      if (!username || !password) {
        return c.json({ message: "Username and password required" }, 400);
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) return c.json({ message: "Username already exists" }, 409);

      if (email) {
        const existingEmail = await storage.getUserByEmail(email);
        if (existingEmail) return c.json({ message: "Email already exists" }, 409);
      }

      const passwordHash = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        role: "user",
      });

      const token = await createToken({
        userId: newUser.id,
        username: newUser.username ?? "",
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      });

      setCookie(c, "token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      const { passwordHash: _, ...userData } = newUser;
      return c.json(userData);
    } catch (error) {
      console.error("Registration error:", error);
      return c.json({ message: "Server error" }, 500);
    }
  });

  app.post("/api/auth/logout", (c) => {
    deleteCookie(c, "token", { path: "/" });
    return c.json({ message: "Logged out successfully" });
  });

  app.get("/api/auth/user", isAuthenticated, (c) => {
    return c.json({
      id: c.var.userId,
      username: c.var.username,
      email: c.var.email,
      firstName: c.var.firstName,
      lastName: c.var.lastName,
      role: c.var.role,
    });
  });
}
