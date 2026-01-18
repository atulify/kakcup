#!/usr/bin/env tsx
/**
 * Standalone database initialization script for Vercel deployment
 *
 * This script should be run BEFORE deploying to Vercel to initialize
 * the database with schema and seed data.
 *
 * Usage:
 *   DATABASE_URL="your-postgres-url" npm run db:init-vercel
 *
 * Or using Vercel CLI to pull environment variables:
 *   vercel env pull .env.production.local
 *   npm run db:init-vercel
 */

import { migratePostgreSQL } from "../server/migrate.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ ERROR: DATABASE_URL environment variable is required for Vercel deployment");
  console.error("\nPlease set DATABASE_URL to your PostgreSQL connection string:");
  console.error("  DATABASE_URL='postgresql://...' npm run db:init-vercel");
  console.error("\nOr pull environment variables from Vercel:");
  console.error("  vercel env pull .env.production.local");
  console.error("  npm run db:init-vercel");
  process.exit(1);
}

console.log("=== Initializing Vercel Database ===\n");
console.log("Database URL:", DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Hide password
console.log("");

migratePostgreSQL()
  .then(() => {
    console.log("\n✅ Database initialization completed successfully!");
    console.log("\nYour Vercel database is ready for deployment.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Database initialization failed:", error);
    process.exit(1);
  });
