import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../shared/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;

// isPostgres stays true for production; local dev uses setDb() to override with SQLite
export const isPostgres = true;

// db is a live ESM export — setDb() updates it for local SQLite dev mode
let db: ReturnType<typeof drizzle> | any = DATABASE_URL
  ? drizzle(neon(DATABASE_URL), { schema })
  : null;

export { db };

// Called by server/index.ts in local dev when DATABASE_URL is absent
export function setDb(newDb: any) {
  db = newDb;
}
