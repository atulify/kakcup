import { isPostgres } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Check if database is initialized by checking if tables exist
 */
async function isDatabaseInitialized(): Promise<boolean> {
  try {
    if (isPostgres) {
      const DATABASE_URL = process.env.DATABASE_URL!;
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(DATABASE_URL);
      const [row] = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'years'
        ) AS "exists"
      `;
      return (row as any).exists === true;
    } else {
      // SQLite path — only reached in local dev without DATABASE_URL
      const Database = (await import("better-sqlite3")).default;
      const sqlite = new Database(path.resolve(__dirname, "../kakcup.db"));
      const result = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='years'`)
        .all();
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

  const initialized = await isDatabaseInitialized();

  if (initialized) {
    console.log("✓ Database is already initialized");
    return;
  }

  console.log("Database not initialized. Running migrations...");

  try {
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
    console.warn("⚠ App starting despite database initialization issues");
  }
}

export { initializeDatabase };
