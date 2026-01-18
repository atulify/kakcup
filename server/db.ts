import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from "../shared/schema.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine which database to use based on DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;
export const isPostgres = !!DATABASE_URL;

// Type the db variable to work with both SQLite and PostgreSQL
// At runtime, only one will be used based on DATABASE_URL
let db: any;
let pgPool: Pool | null = null;

if (isPostgres) {
  // PostgreSQL connection with optimized pooling for serverless
  console.log("Using PostgreSQL database");

  // Ensure sslmode=verify-full for security (addresses pg deprecation warning)
  let connectionString = DATABASE_URL;
  if (connectionString && !connectionString.includes('sslmode=')) {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=verify-full';
  }

  pgPool = new Pool({
    connectionString,
    // Serverless-optimized pool settings
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if unable to connect
    // Allow pool to be reused across function invocations
    allowExitOnIdle: false,
  });

  // Handle pool errors
  pgPool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
  });

  db = drizzlePostgres(pgPool, { schema }) as any;
} else {
  // SQLite connection (local development only)
  // Dynamic import to avoid loading native modules in serverless environment
  console.log("Using SQLite database");
  const { drizzle: drizzleSqlite } = await import('drizzle-orm/better-sqlite3');
  const Database = (await import('better-sqlite3')).default;
  const dbPath = path.resolve(__dirname, "../kakcup.db");
  const sqlite = new Database(dbPath);
  db = drizzleSqlite(sqlite, { schema }) as any;
}

export { db, pgPool };
