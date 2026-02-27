import type { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { storage } from "./storage.js";
import {
  isAuthenticated,
  isAdmin,
  verifyPassword,
  hashPassword,
  createToken,
  type AppEnv,
} from "./auth.js";

export function createRoutes(app: Hono<AppEnv>): void {
  const isProd = process.env.NODE_ENV === "production";

  // Auth routes
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

  // Year routes
  app.get("/api/years", async (c) => {
    try {
      const years = await storage.getYears();
      return c.json(years);
    } catch {
      return c.json({ error: "Failed to fetch years" }, 500);
    }
  });

  app.get("/api/years/:year", async (c) => {
    try {
      const yearParam = c.req.param("year");
      const year = parseInt(yearParam);

      if (isNaN(year)) {
        const yearRecord = await storage.getYearById(yearParam);
        if (!yearRecord) return c.json({ error: "Year not found" }, 404);
        return c.json(yearRecord);
      }

      const yearRecord = await storage.getYear(year);
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      return c.json(yearRecord);
    } catch (error) {
      console.error("Error fetching year:", error);
      return c.json({ error: "Failed to fetch year" }, 500);
    }
  });

  app.patch("/api/years/:yearId", isAdmin, async (c) => {
    try {
      const yearData = await c.req.json();
      const year = await storage.updateYear(c.req.param("yearId"), yearData);
      return c.json(year);
    } catch {
      return c.json({ error: "Failed to update year" }, 500);
    }
  });

  // Team routes
  app.get("/api/years/:yearId/teams", async (c) => {
    try {
      const teams = await storage.getTeamsByYear(c.req.param("yearId"));
      return c.json(teams);
    } catch {
      return c.json({ error: "Failed to fetch teams" }, 500);
    }
  });

  app.post("/api/years/:yearId/teams", isAdmin, async (c) => {
    try {
      const teamData = await c.req.json();
      teamData.yearId = c.req.param("yearId");
      const team = await storage.createTeam(teamData);
      return c.json(team, 201);
    } catch {
      return c.json({ error: "Failed to create team" }, 500);
    }
  });

  app.put("/api/teams/:teamId", isAdmin, async (c) => {
    try {
      const teamData = await c.req.json();
      const team = await storage.updateTeam(c.req.param("teamId"), teamData);
      return c.json(team);
    } catch {
      return c.json({ error: "Failed to update team" }, 500);
    }
  });

  // Fish weights routes
  app.get("/api/years/:yearId/fish-weights", async (c) => {
    try {
      const fishWeights = await storage.getFishWeightsByYear(c.req.param("yearId"));
      return c.json(fishWeights);
    } catch {
      return c.json({ error: "Failed to fetch fish weights" }, 500);
    }
  });

  app.post("/api/years/:yearId/fish-weights", isAdmin, async (c) => {
    try {
      const yearRecord = await storage.getYearById(c.req.param("yearId"));
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      if (yearRecord.fishing_locked) {
        return c.json({ error: "Fishing competition is locked. No more weights can be added." }, 403);
      }

      const weightData = await c.req.json();
      weightData.yearId = c.req.param("yearId");
      const fishWeight = await storage.createFishWeight(weightData);
      return c.json(fishWeight, 201);
    } catch {
      return c.json({ error: "Failed to create fish weight" }, 500);
    }
  });

  app.delete("/api/years/:yearId/teams/:teamId/fish-weights", isAdmin, async (c) => {
    try {
      const yearRecord = await storage.getYearById(c.req.param("yearId"));
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      if (yearRecord.fishing_locked) {
        return c.json({ error: "Fishing competition is locked. Cannot delete weights." }, 403);
      }

      await storage.deleteFishWeightsByTeam(c.req.param("yearId"), c.req.param("teamId"));
      return c.json({ message: "Fish weights deleted successfully" });
    } catch {
      return c.json({ error: "Failed to delete fish weights" }, 500);
    }
  });

  // Chug times routes
  app.get("/api/years/:yearId/chug-times", async (c) => {
    try {
      const chugTimes = await storage.getChugTimesByYear(c.req.param("yearId"));
      return c.json(chugTimes);
    } catch {
      return c.json({ error: "Failed to fetch chug times" }, 500);
    }
  });

  app.post("/api/years/:yearId/chug-times", isAdmin, async (c) => {
    try {
      const yearRecord = await storage.getYearById(c.req.param("yearId"));
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      if (yearRecord.chug_locked) {
        return c.json({ error: "Chug competition is locked. No more times can be added." }, 403);
      }

      const chugData = await c.req.json();
      chugData.yearId = c.req.param("yearId");
      const chugTime = await storage.createChugTime(chugData);
      return c.json(chugTime, 201);
    } catch {
      return c.json({ error: "Failed to create chug time" }, 500);
    }
  });

  app.delete("/api/years/:yearId/teams/:teamId/chug-times", isAdmin, async (c) => {
    try {
      const yearRecord = await storage.getYearById(c.req.param("yearId"));
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      if (yearRecord.chug_locked) {
        return c.json({ error: "Chug competition is locked. Cannot delete times." }, 403);
      }

      await storage.deleteChugTime(c.req.param("yearId"), c.req.param("teamId"));
      return c.json({ message: "Chug time deleted successfully" });
    } catch {
      return c.json({ error: "Failed to delete chug time" }, 500);
    }
  });

  // Golf scores routes
  app.get("/api/years/:yearId/golf-scores", async (c) => {
    try {
      const golfScores = await storage.getGolfScoresByYear(c.req.param("yearId"));
      return c.json(golfScores);
    } catch {
      return c.json({ error: "Failed to fetch golf scores" }, 500);
    }
  });

  app.post("/api/years/:yearId/golf-scores", isAdmin, async (c) => {
    try {
      const yearRecord = await storage.getYearById(c.req.param("yearId"));
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      if (yearRecord.golf_locked) {
        return c.json({ error: "Golf competition is locked. No more scores can be added." }, 403);
      }

      const golfData = await c.req.json();
      golfData.yearId = c.req.param("yearId");
      const golfScore = await storage.createGolfScore(golfData);
      return c.json(golfScore, 201);
    } catch {
      return c.json({ error: "Failed to create golf score" }, 500);
    }
  });

  app.delete("/api/years/:yearId/teams/:teamId/golf-scores", isAdmin, async (c) => {
    try {
      const yearRecord = await storage.getYearById(c.req.param("yearId"));
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      if (yearRecord.golf_locked) {
        return c.json({ error: "Golf competition is locked. Cannot delete scores." }, 403);
      }

      await storage.deleteGolfScore(c.req.param("yearId"), c.req.param("teamId"));
      return c.json({ message: "Golf score deleted successfully" });
    } catch {
      return c.json({ error: "Failed to delete golf score" }, 500);
    }
  });
}
