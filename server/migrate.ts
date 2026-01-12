import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import * as schema from "@shared/schema";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine which database to use based on DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = !!DATABASE_URL;

async function migrateSqlite() {
  console.log("=== SQLite Migration ===");
  const dbPath = path.resolve(__dirname, "../kakcup.db");
  console.log("Creating SQLite database at:", dbPath);

  const sqlite = new Database(dbPath);
  const db = drizzleSqlite(sqlite, { schema });

  // Create tables
  console.log("Creating tables...");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" TEXT PRIMARY KEY,
      "sess" TEXT NOT NULL,
      "expire" INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" TEXT PRIMARY KEY,
      "username" TEXT UNIQUE,
      "email" TEXT UNIQUE,
      "password_hash" TEXT,
      "first_name" TEXT,
      "last_name" TEXT,
      "profile_image_url" TEXT,
      "role" TEXT NOT NULL DEFAULT 'user',
      "created_at" INTEGER,
      "updated_at" INTEGER
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "years" (
      "id" TEXT PRIMARY KEY,
      "year" INTEGER NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'upcoming',
      "fishing_locked" INTEGER NOT NULL DEFAULT 0
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "teams" (
      "id" TEXT PRIMARY KEY,
      "year_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "kak1" TEXT,
      "kak2" TEXT,
      "kak3" TEXT,
      "kak4" TEXT,
      "locked" INTEGER NOT NULL DEFAULT 0
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "fish_weights" (
      "id" TEXT PRIMARY KEY,
      "year_id" TEXT NOT NULL,
      "team_id" TEXT NOT NULL,
      "weight" REAL,
      "notes" TEXT
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "chug_times" (
      "id" TEXT PRIMARY KEY,
      "year_id" TEXT NOT NULL,
      "team_id" TEXT NOT NULL,
      "chug_1" REAL,
      "chug_2" REAL,
      "average" REAL,
      "notes" TEXT
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS "unique_chug_year_team" ON "chug_times" ("year_id", "team_id");
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "golf_scores" (
      "id" TEXT PRIMARY KEY,
      "year_id" TEXT NOT NULL,
      "team_id" TEXT NOT NULL,
      "score" INTEGER,
      "notes" TEXT
    );
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS "unique_golf_year_team" ON "golf_scores" ("year_id", "team_id");
  `);

  console.log("Tables created successfully!");

  // Import data from JSON files
  await importData(sqlite, false);

  console.log("\nSQLite migration completed successfully!");
  sqlite.close();
}

async function migratePostgreSQL() {
  console.log("=== PostgreSQL Migration ===");
  console.log("Connecting to PostgreSQL...");

  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  const db = drizzlePostgres(pool, { schema });

  // Create tables using SQL for PostgreSQL
  console.log("Creating tables...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" TEXT PRIMARY KEY,
      "sess" TEXT NOT NULL,
      "expire" TIMESTAMP WITH TIME ZONE NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "username" TEXT UNIQUE,
      "email" TEXT UNIQUE,
      "password_hash" TEXT,
      "first_name" TEXT,
      "last_name" TEXT,
      "profile_image_url" TEXT,
      "role" TEXT NOT NULL DEFAULT 'user',
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "years" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year" INTEGER NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'upcoming',
      "fishing_locked" BOOLEAN NOT NULL DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "teams" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "name" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "kak1" TEXT,
      "kak2" TEXT,
      "kak3" TEXT,
      "kak4" TEXT,
      "locked" BOOLEAN NOT NULL DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "fish_weights" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "team_id" UUID NOT NULL,
      "weight" NUMERIC(10, 2),
      "notes" TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "chug_times" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "team_id" UUID NOT NULL,
      "chug_1" NUMERIC(10, 2),
      "chug_2" NUMERIC(10, 2),
      "average" NUMERIC(10, 2),
      "notes" TEXT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "unique_chug_year_team" ON "chug_times" ("year_id", "team_id");
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "golf_scores" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "team_id" UUID NOT NULL,
      "score" INTEGER,
      "notes" TEXT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "unique_golf_year_team" ON "golf_scores" ("year_id", "team_id");
  `);

  console.log("Tables created successfully!");

  // Import data from JSON files
  await importData(pool, true);

  console.log("\nPostgreSQL migration completed successfully!");
  await pool.end();
}

async function importData(client: Database.Database | Pool, isPostgres: boolean) {
  console.log("\nImporting data...");

  const dataDir = path.resolve(__dirname, "../data");

  // Import years
  try {
    const yearsData = JSON.parse(readFileSync(path.join(dataDir, "years.json"), "utf-8"));

    if (isPostgres) {
      const pool = client as Pool;
      for (const year of yearsData) {
        await pool.query(`
          INSERT INTO years (id, year, name, status, fishing_locked)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [year.id, year.year, year.name, year.status, year.fishing_locked]);
      }
    } else {
      const sqlite = client as Database.Database;
      const insertYear = sqlite.prepare(`
        INSERT OR IGNORE INTO years (id, year, name, status, fishing_locked)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const year of yearsData) {
        insertYear.run(
          year.id,
          year.year,
          year.name,
          year.status,
          year.fishing_locked ? 1 : 0
        );
      }
    }
    console.log(`Imported ${yearsData.length} years`);
  } catch (error) {
    console.log("No years data to import or error:", error);
  }

  // Import teams
  try {
    const teamsData = JSON.parse(readFileSync(path.join(dataDir, "teams.json"), "utf-8"));

    if (isPostgres) {
      const pool = client as Pool;
      for (const team of teamsData) {
        await pool.query(`
          INSERT INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `, [team.id, team.year_id, team.name, team.position, team.kak1, team.kak2, team.kak3, team.kak4, team.locked]);
      }
    } else {
      const sqlite = client as Database.Database;
      const insertTeam = sqlite.prepare(`
        INSERT OR IGNORE INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const team of teamsData) {
        insertTeam.run(
          team.id,
          team.year_id,
          team.name,
          team.position,
          team.kak1,
          team.kak2,
          team.kak3,
          team.kak4,
          team.locked ? 1 : 0
        );
      }
    }
    console.log(`Imported ${teamsData.length} teams`);
  } catch (error) {
    console.log("No teams data to import or error:", error);
  }

  // Import users (if exists)
  try {
    const usersData = JSON.parse(readFileSync(path.join(dataDir, "users.json"), "utf-8"));

    if (isPostgres) {
      const pool = client as Pool;
      for (const user of usersData) {
        await pool.query(`
          INSERT INTO users (id, username, email, password_hash, first_name, last_name, profile_image_url, role, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          user.id,
          user.username,
          user.email,
          user.password_hash,
          user.first_name,
          user.last_name,
          user.profile_image_url,
          user.role,
          user.created_at ? new Date(user.created_at) : new Date(),
          user.updated_at ? new Date(user.updated_at) : new Date()
        ]);
      }
    } else {
      const sqlite = client as Database.Database;
      const insertUser = sqlite.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, password_hash, first_name, last_name, profile_image_url, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const user of usersData) {
        insertUser.run(
          user.id,
          user.username,
          user.email,
          user.password_hash,
          user.first_name,
          user.last_name,
          user.profile_image_url,
          user.role,
          user.created_at ? new Date(user.created_at).getTime() : null,
          user.updated_at ? new Date(user.updated_at).getTime() : null
        );
      }
    }
    console.log(`Imported ${usersData.length} users`);
  } catch (error) {
    console.log("No users data to import");
  }

  // Import fish weights
  try {
    const fishWeightsData = JSON.parse(readFileSync(path.join(dataDir, "fish_weights.json"), "utf-8"));

    if (isPostgres) {
      const pool = client as Pool;
      for (const weight of fishWeightsData) {
        await pool.query(`
          INSERT INTO fish_weights (id, year_id, team_id, weight, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [weight.id, weight.year_id, weight.team_id, weight.weight, weight.notes]);
      }
    } else {
      const sqlite = client as Database.Database;
      const insertFishWeight = sqlite.prepare(`
        INSERT OR IGNORE INTO fish_weights (id, year_id, team_id, weight, notes)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const weight of fishWeightsData) {
        insertFishWeight.run(
          weight.id,
          weight.year_id,
          weight.team_id,
          weight.weight ? parseFloat(weight.weight) : null,
          weight.notes
        );
      }
    }
    console.log(`Imported ${fishWeightsData.length} fish weights`);
  } catch (error) {
    console.log("No fish weights data to import");
  }

  // Import chug times
  try {
    const chugTimesData = JSON.parse(readFileSync(path.join(dataDir, "chug_times.json"), "utf-8"));

    if (isPostgres) {
      const pool = client as Pool;
      for (const chug of chugTimesData) {
        await pool.query(`
          INSERT INTO chug_times (id, year_id, team_id, chug_1, chug_2, average, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [chug.id, chug.year_id, chug.team_id, chug.chug_1, chug.chug_2, chug.average, chug.notes]);
      }
    } else {
      const sqlite = client as Database.Database;
      const insertChugTime = sqlite.prepare(`
        INSERT OR IGNORE INTO chug_times (id, year_id, team_id, chug_1, chug_2, average, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const chug of chugTimesData) {
        insertChugTime.run(
          chug.id,
          chug.year_id,
          chug.team_id,
          chug.chug_1 ? parseFloat(chug.chug_1) : null,
          chug.chug_2 ? parseFloat(chug.chug_2) : null,
          chug.average ? parseFloat(chug.average) : null,
          chug.notes
        );
      }
    }
    console.log(`Imported ${chugTimesData.length} chug times`);
  } catch (error) {
    console.log("No chug times data to import");
  }

  // Import golf scores
  try {
    const golfScoresData = JSON.parse(readFileSync(path.join(dataDir, "golf_scores.json"), "utf-8"));

    if (isPostgres) {
      const pool = client as Pool;
      for (const golf of golfScoresData) {
        await pool.query(`
          INSERT INTO golf_scores (id, year_id, team_id, score, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [golf.id, golf.year_id, golf.team_id, golf.score, golf.notes]);
      }
    } else {
      const sqlite = client as Database.Database;
      const insertGolfScore = sqlite.prepare(`
        INSERT OR IGNORE INTO golf_scores (id, year_id, team_id, score, notes)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const golf of golfScoresData) {
        insertGolfScore.run(
          golf.id,
          golf.year_id,
          golf.team_id,
          golf.score,
          golf.notes
        );
      }
    }
    console.log(`Imported ${golfScoresData.length} golf scores`);
  } catch (error) {
    console.log("No golf scores data to import");
  }
}

// Export functions for use in other modules
export { migrateSqlite, migratePostgreSQL };

// Run the appropriate migration when this module is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (isPostgres) {
    migratePostgreSQL().catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
  } else {
    migrateSqlite().catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
  }
}
