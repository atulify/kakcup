import { db, isPostgres, pgPool } from "./db.js";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Check if database is initialized by checking if tables exist
 */
async function isDatabaseInitialized(): Promise<boolean> {
  try {
    if (isPostgres && pgPool) {
      // Check if years table exists in PostgreSQL
      const result = await pgPool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'years'
        )`
      );
      return result.rows[0]?.exists || false;
    } else {
      // Check if years table exists in SQLite
      const sqlite = new Database(path.resolve(__dirname, "../kakcup.db"));
      const result = sqlite.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='years'`
      ).all();
      sqlite.close();
      return (result as any[]).length > 0;
    }
  } catch (error) {
    console.error("Error checking database initialization:", error);
    return false;
  }
}

/**
 * Initialize database on first run
 */
async function initializeDatabase() {
  console.log("Checking database initialization...");

  const isInitialized = await isDatabaseInitialized();

  if (isInitialized) {
    console.log("✓ Database is already initialized");
    return;
  }

  console.log("Database not initialized. Running migrations...");

  try {
    // Import and run the migration module
    const { migrateSqlite, migratePostgreSQL } = await import("./migrate.js");

    if (isPostgres) {
      console.log("Running PostgreSQL migrations...");
      await migratePostgreSQL();
    } else {
      console.log("Running SQLite migrations...");
      await migrateSqlite();
    }

    console.log("✓ Database initialized successfully with seeded data");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    // Don't exit - let the app start anyway
    // The tables might be created but data import failed
    console.warn("⚠ App starting despite database initialization issues");
  }
}

export { initializeDatabase };
