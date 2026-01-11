import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import * as schema from "@shared/schema";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine which database to use based on DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;
export const isPostgres = !!DATABASE_URL;

let db: ReturnType<typeof drizzleSqlite> | ReturnType<typeof drizzlePostgres>;
let pgPool: Pool | null = null;

if (isPostgres) {
  // PostgreSQL connection
  console.log("Using PostgreSQL database");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
  });
  db = drizzlePostgres(pgPool, { schema });
} else {
  // SQLite connection
  console.log("Using SQLite database");
  const dbPath = path.resolve(__dirname, "../kakcup.db");
  const sqlite = new Database(dbPath);
  db = drizzleSqlite(sqlite, { schema });
}

export { db, pgPool };
