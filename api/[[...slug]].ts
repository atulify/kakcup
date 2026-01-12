import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { registerRoutes } from '../server/routes.js';
import { serveStatic, log } from '../server/vite.js';
import { initializeDatabase } from '../server/init-db.js';

// Create app instance
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware for logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize database and set up routes
let initialized = false;

export default async (req: VercelRequest, res: VercelResponse) => {
  // Initialize only once
  if (!initialized) {
    try {
      await initializeDatabase();
      const server = await registerRoutes(app);
      serveStatic(app);
      initialized = true;
    } catch (e) {
      console.error('Initialization error:', e);
      res.status(500).json({ message: 'Server initialization failed' });
      return;
    }
  }

  // Handle the request with Express
  app(req, res);
};
