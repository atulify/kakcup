import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = !!DATABASE_URL;

async function migrateSqlite() {
  console.log("=== SQLite Migration ===");
  const dbPath = path.resolve(__dirname, "../kakcup.db");
  console.log("Creating SQLite database at:", dbPath);

  const sqlite = new Database(dbPath);

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
      "fishing_locked" INTEGER NOT NULL DEFAULT 0,
      "chug_locked" INTEGER NOT NULL DEFAULT 0,
      "golf_locked" INTEGER NOT NULL DEFAULT 0
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

  await importDataSqlite(sqlite);

  console.log("\nSQLite migration completed successfully!");
  sqlite.close();
}

async function migratePostgreSQL() {
  console.log("=== PostgreSQL Migration ===");
  console.log("Connecting to PostgreSQL...");

  const sql = neon(DATABASE_URL!);

  // Create tables using SQL for PostgreSQL
  console.log("Creating tables...");

  await sql`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" TEXT PRIMARY KEY,
      "sess" TEXT NOT NULL,
      "expire" TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire")
  `;

  await sql`
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
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "years" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year" INTEGER NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'upcoming',
      "fishing_locked" BOOLEAN NOT NULL DEFAULT false,
      "chug_locked" BOOLEAN NOT NULL DEFAULT false,
      "golf_locked" BOOLEAN NOT NULL DEFAULT false
    )
  `;

  await sql`
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
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "fish_weights" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "team_id" UUID NOT NULL,
      "weight" NUMERIC(10, 2),
      "notes" TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "chug_times" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "team_id" UUID NOT NULL,
      "chug_1" NUMERIC(10, 3),
      "chug_2" NUMERIC(10, 3),
      "average" NUMERIC(10, 3),
      "notes" TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "unique_chug_year_team" ON "chug_times" ("year_id", "team_id")
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "golf_scores" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "year_id" UUID NOT NULL,
      "team_id" UUID NOT NULL,
      "score" INTEGER,
      "notes" TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "unique_golf_year_team" ON "golf_scores" ("year_id", "team_id")
  `;

  console.log("Tables created successfully!");

  await importDataPostgres(sql);

  console.log("\nPostgreSQL migration completed successfully!");
}

async function importDataSqlite(sqlite: Database.Database) {
  console.log("\nImporting data...");
  const dataDir = path.resolve(__dirname, "../data");

  try {
    const yearsData = JSON.parse(readFileSync(path.join(dataDir, "years.json"), "utf-8"));
    const insertYear = sqlite.prepare(`
      INSERT OR IGNORE INTO years (id, year, name, status, fishing_locked)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const year of yearsData) {
      insertYear.run(year.id, year.year, year.name, year.status, year.fishing_locked ? 1 : 0);
    }
    console.log(`Imported ${yearsData.length} years`);
  } catch (error) {
    console.log("No years data to import or error:", error);
  }

  try {
    const teamsData = JSON.parse(readFileSync(path.join(dataDir, "teams.json"), "utf-8"));
    const insertTeam = sqlite.prepare(`
      INSERT OR IGNORE INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const team of teamsData) {
      insertTeam.run(team.id, team.year_id, team.name, team.position, team.kak1, team.kak2, team.kak3, team.kak4, team.locked ? 1 : 0);
    }
    console.log(`Imported ${teamsData.length} teams`);
  } catch (error) {
    console.log("No teams data to import or error:", error);
  }

  try {
    const usersData = JSON.parse(readFileSync(path.join(dataDir, "users.json"), "utf-8"));
    const insertUser = sqlite.prepare(`
      INSERT OR IGNORE INTO users (id, username, email, password_hash, first_name, last_name, profile_image_url, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const user of usersData) {
      insertUser.run(
        user.id, user.username, user.email, user.password_hash,
        user.first_name, user.last_name, user.profile_image_url, user.role,
        user.created_at ? new Date(user.created_at).getTime() : null,
        user.updated_at ? new Date(user.updated_at).getTime() : null,
      );
    }
    console.log(`Imported ${usersData.length} users`);
  } catch {
    console.log("No users data to import");
  }

  try {
    const fishWeightsData = JSON.parse(readFileSync(path.join(dataDir, "fish_weights.json"), "utf-8"));
    const insertFishWeight = sqlite.prepare(`
      INSERT OR IGNORE INTO fish_weights (id, year_id, team_id, weight, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const weight of fishWeightsData) {
      insertFishWeight.run(weight.id, weight.year_id, weight.team_id, weight.weight ? parseFloat(weight.weight) : null, weight.notes);
    }
    console.log(`Imported ${fishWeightsData.length} fish weights`);
  } catch {
    console.log("No fish weights data to import");
  }

  try {
    const chugTimesData = JSON.parse(readFileSync(path.join(dataDir, "chug_times.json"), "utf-8"));
    const insertChugTime = sqlite.prepare(`
      INSERT OR IGNORE INTO chug_times (id, year_id, team_id, chug_1, chug_2, average, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const chug of chugTimesData) {
      insertChugTime.run(
        chug.id, chug.year_id, chug.team_id,
        chug.chug_1 ? parseFloat(chug.chug_1) : null,
        chug.chug_2 ? parseFloat(chug.chug_2) : null,
        chug.average ? parseFloat(chug.average) : null,
        chug.notes,
      );
    }
    console.log(`Imported ${chugTimesData.length} chug times`);
  } catch {
    console.log("No chug times data to import");
  }

  try {
    const golfScoresData = JSON.parse(readFileSync(path.join(dataDir, "golf_scores.json"), "utf-8"));
    const insertGolfScore = sqlite.prepare(`
      INSERT OR IGNORE INTO golf_scores (id, year_id, team_id, score, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const golf of golfScoresData) {
      insertGolfScore.run(golf.id, golf.year_id, golf.team_id, golf.score, golf.notes);
    }
    console.log(`Imported ${golfScoresData.length} golf scores`);
  } catch {
    console.log("No golf scores data to import");
  }
}

async function importDataPostgres(sql: any) {
  console.log("\nImporting data...");
  const dataDir = path.resolve(__dirname, "../data");

  try {
    const yearsData = JSON.parse(readFileSync(path.join(dataDir, "years.json"), "utf-8"));
    for (const year of yearsData) {
      await sql`
        INSERT INTO years (id, year, name, status, fishing_locked)
        VALUES (${year.id}, ${year.year}, ${year.name}, ${year.status}, ${year.fishing_locked})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Imported ${yearsData.length} years`);
  } catch (error) {
    console.log("No years data to import or error:", error);
  }

  try {
    const teamsData = JSON.parse(readFileSync(path.join(dataDir, "teams.json"), "utf-8"));
    for (const team of teamsData) {
      await sql`
        INSERT INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
        VALUES (${team.id}, ${team.year_id}, ${team.name}, ${team.position}, ${team.kak1}, ${team.kak2}, ${team.kak3}, ${team.kak4}, ${team.locked})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Imported ${teamsData.length} teams`);
  } catch (error) {
    console.log("No teams data to import or error:", error);
  }

  try {
    const usersData = JSON.parse(readFileSync(path.join(dataDir, "users.json"), "utf-8"));
    for (const user of usersData) {
      await sql`
        INSERT INTO users (id, username, email, password_hash, first_name, last_name, profile_image_url, role, created_at, updated_at)
        VALUES (${user.id}, ${user.username}, ${user.email}, ${user.password_hash}, ${user.first_name}, ${user.last_name}, ${user.profile_image_url}, ${user.role}, ${user.created_at ? new Date(user.created_at) : new Date()}, ${user.updated_at ? new Date(user.updated_at) : new Date()})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Imported ${usersData.length} users`);
  } catch {
    console.log("No users data to import");
  }

  try {
    const fishWeightsData = JSON.parse(readFileSync(path.join(dataDir, "fish_weights.json"), "utf-8"));
    for (const weight of fishWeightsData) {
      await sql`
        INSERT INTO fish_weights (id, year_id, team_id, weight, notes)
        VALUES (${weight.id}, ${weight.year_id}, ${weight.team_id}, ${weight.weight}, ${weight.notes})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Imported ${fishWeightsData.length} fish weights`);
  } catch {
    console.log("No fish weights data to import");
  }

  try {
    const chugTimesData = JSON.parse(readFileSync(path.join(dataDir, "chug_times.json"), "utf-8"));
    for (const chug of chugTimesData) {
      await sql`
        INSERT INTO chug_times (id, year_id, team_id, chug_1, chug_2, average, notes)
        VALUES (${chug.id}, ${chug.year_id}, ${chug.team_id}, ${chug.chug_1}, ${chug.chug_2}, ${chug.average}, ${chug.notes})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Imported ${chugTimesData.length} chug times`);
  } catch {
    console.log("No chug times data to import");
  }

  try {
    const golfScoresData = JSON.parse(readFileSync(path.join(dataDir, "golf_scores.json"), "utf-8"));
    for (const golf of golfScoresData) {
      await sql`
        INSERT INTO golf_scores (id, year_id, team_id, score, notes)
        VALUES (${golf.id}, ${golf.year_id}, ${golf.team_id}, ${golf.score}, ${golf.notes})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`Imported ${golfScoresData.length} golf scores`);
  } catch {
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
