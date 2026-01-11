import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import SqliteStore from "better-sqlite3-session-store";
import { storage } from "./storage";
import { isAuthenticated, isAdmin, verifyPassword, hashPassword } from "./auth";
import { insertYearSchema, insertTeamSchema } from "@shared/schema";
import { isPostgres, pgPool } from "./db";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware with database-backed storage
  app.set("trust proxy", 1);

  // Configure session store based on database type
  let sessionStore;
  if (isPostgres && pgPool) {
    // PostgreSQL session store
    const PgSession = connectPgSimple(session);
    sessionStore = new PgSession({
      pool: pgPool,
      tableName: 'sessions',
      createTableIfMissing: true,
    });
  } else {
    // SQLite session store
    const dbPath = path.resolve(__dirname, "../kakcup.db");
    const SqliteSessionStore = SqliteStore(session);
    sessionStore = new SqliteSessionStore({
      client: new Database(dbPath),
      expired: {
        clear: true,
        intervalMs: 900000, // Clean up expired sessions every 15 minutes
      },
    });
  }

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'default-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  }));

  // Auth routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      // Find user by username
      const user = await storage.getUserByUsername(username);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Set session
      req.session.userId = user.id;
      
      // Return user data (without password hash)
      const { passwordHash, ...userData } = user;
      res.json(userData);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      if (email) {
        const existingEmail = await storage.getUserByEmail(email);
        if (existingEmail) {
          return res.status(409).json({ message: "Email already exists" });
        }
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        role: "user",
      });

      // Set session
      req.session.userId = newUser.id;

      // Return user data (without password hash)
      const { passwordHash: _, ...userData } = newUser;
      res.json(userData);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user data (without password hash)
      const { passwordHash, ...userData } = user;
      res.json(userData);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Year routes
  app.get("/api/years", async (req, res) => {
    try {
      const years = await storage.getYears();
      res.json(years);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch years" });
    }
  });

  app.get("/api/years/:year", async (req, res) => {
    try {
      const yearParam = req.params.year;
      const year = parseInt(yearParam);
      
      if (isNaN(year)) {
        // If it's not a number, treat it as a UUID
        console.log("Route handler: Looking for UUID:", yearParam);
        const yearRecord = await storage.getYearById(yearParam);
        console.log("Route handler: Got record:", yearRecord);
        if (!yearRecord) {
          console.log("Route handler: No record found, returning 404");
          return res.status(404).json({ error: "Year not found" });
        }
        return res.json(yearRecord);
      }
      
      // It's a year number
      const yearRecord = await storage.getYear(year);
      if (!yearRecord) {
        return res.status(404).json({ error: "Year not found" });
      }
      
      res.json(yearRecord);
    } catch (error) {
      console.error("Error fetching year:", error);
      res.status(500).json({ error: "Failed to fetch year" });
    }
  });



  app.patch("/api/years/:yearId", isAdmin, async (req, res) => {
    try {
      const yearData = req.body;
      const year = await storage.updateYear(req.params.yearId, yearData);
      res.json(year);
    } catch (error) {
      res.status(500).json({ error: "Failed to update year" });
    }
  });

  // Team routes
  app.get("/api/years/:yearId/teams", async (req, res) => {
    try {
      const teams = await storage.getTeamsByYear(req.params.yearId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teams" });
    }
  });

  app.post("/api/years/:yearId/teams", isAdmin, async (req, res) => {
    try {
      const teamData = req.body;
      teamData.yearId = req.params.yearId;
      const team = await storage.createTeam(teamData);
      res.status(201).json(team);
    } catch (error) {
      res.status(500).json({ error: "Failed to create team" });
    }
  });

  app.put("/api/teams/:teamId", isAdmin, async (req, res) => {
    try {
      const teamData = req.body;
      const team = await storage.updateTeam(req.params.teamId, teamData);
      res.json(team);
    } catch (error) {
      res.status(500).json({ error: "Failed to update team" });
    }
  });

  // Fish weights routes
  app.get("/api/years/:yearId/fish-weights", async (req, res) => {
    try {
      const fishWeights = await storage.getFishWeightsByYear(req.params.yearId);
      res.json(fishWeights);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fish weights" });
    }
  });

  app.post("/api/years/:yearId/fish-weights", isAdmin, async (req, res) => {
    try {
      // Check if fishing is locked for this year
      const yearRecord = await storage.getYearById(req.params.yearId);
      if (!yearRecord) {
        return res.status(404).json({ error: "Year not found" });
      }
      
      if (yearRecord.fishing_locked) {
        return res.status(403).json({ error: "Fishing competition is locked. No more weights can be added." });
      }
      
      const weightData = req.body;
      weightData.yearId = req.params.yearId;
      const fishWeight = await storage.createFishWeight(weightData);
      res.status(201).json(fishWeight);
    } catch (error) {
      res.status(500).json({ error: "Failed to create fish weight" });
    }
  });

  // Chug times routes
  app.get("/api/years/:yearId/chug-times", async (req, res) => {
    try {
      const chugTimes = await storage.getChugTimesByYear(req.params.yearId);
      res.json(chugTimes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chug times" });
    }
  });

  app.post("/api/years/:yearId/chug-times", isAdmin, async (req, res) => {
    try {
      const chugData = req.body;
      chugData.yearId = req.params.yearId;
      const chugTime = await storage.createChugTime(chugData);
      res.status(201).json(chugTime);
    } catch (error) {
      res.status(500).json({ error: "Failed to create chug time" });
    }
  });

  // Golf scores routes
  app.get("/api/years/:yearId/golf-scores", async (req, res) => {
    try {
      const golfScores = await storage.getGolfScoresByYear(req.params.yearId);
      res.json(golfScores);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch golf scores" });
    }
  });

  app.post("/api/years/:yearId/golf-scores", isAdmin, async (req, res) => {
    try {
      const golfData = req.body;
      golfData.yearId = req.params.yearId;
      const golfScore = await storage.createGolfScore(golfData);
      res.status(201).json(golfScore);
    } catch (error) {
      res.status(500).json({ error: "Failed to create golf score" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
