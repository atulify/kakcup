import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Create Express app once at module level (reused across warm invocations)
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Only capture response body in development to avoid double serialization overhead
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (isDevelopment) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // Only include response body in development
      if (isDevelopment && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

// Initialize routes (done once at module level)
let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function initializeApp() {
  if (isInitialized) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await registerRoutes(app);

    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      console.error(err);
    });

    isInitialized = true;
  })();

  await initPromise;
}

// Serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log(`[API] Incoming request: ${req.method} ${req.url}`);

    // Initialize app on first request (warm starts will skip this)
    await initializeApp();

    // Vercel strips /api prefix when routing to api/[...route].ts, so restore it for Express routing
    const originalUrl = req.url;
    if (!originalUrl?.startsWith('/api')) {
      req.url = `/api${originalUrl}`;
    }

    console.log(`[API] Modified URL for Express: ${req.url}`);

    // Handle the request with Express
    return new Promise((resolve, reject) => {
      app(req as any, res as any, (err?: any) => {
        if (err) {
          console.error("[API] Express error:", err);
          reject(err);
        } else {
          resolve(undefined);
        }
      });
    });
  } catch (error) {
    console.error("Serverless function error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
