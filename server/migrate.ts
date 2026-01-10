import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from "@shared/schema";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../kakcup.db");

console.log("Creating SQLite database at:", dbPath);

const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

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
console.log("\nImporting data...");

const dataDir = path.resolve(__dirname, "../data");

// Import years
const yearsData = JSON.parse(readFileSync(path.join(dataDir, "years.json"), "utf-8"));
const insertYear = sqlite.prepare(`
  INSERT INTO years (id, year, name, status, fishing_locked)
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
console.log(`Imported ${yearsData.length} years`);

// Import teams
const teamsData = JSON.parse(readFileSync(path.join(dataDir, "teams.json"), "utf-8"));
const insertTeam = sqlite.prepare(`
  INSERT INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
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
console.log(`Imported ${teamsData.length} teams`);

// Import users (if exists)
try {
  const usersData = JSON.parse(readFileSync(path.join(dataDir, "users.json"), "utf-8"));
  const insertUser = sqlite.prepare(`
    INSERT INTO users (id, username, email, password_hash, first_name, last_name, profile_image_url, role, created_at, updated_at)
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
  console.log(`Imported ${usersData.length} users`);
} catch (error) {
  console.log("No users data to import");
}

// Import fish weights
try {
  const fishWeightsData = JSON.parse(readFileSync(path.join(dataDir, "fish_weights.json"), "utf-8"));
  const insertFishWeight = sqlite.prepare(`
    INSERT INTO fish_weights (id, year_id, team_id, weight, notes)
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
  console.log(`Imported ${fishWeightsData.length} fish weights`);
} catch (error) {
  console.log("No fish weights data to import");
}

// Import chug times
try {
  const chugTimesData = JSON.parse(readFileSync(path.join(dataDir, "chug_times.json"), "utf-8"));
  const insertChugTime = sqlite.prepare(`
    INSERT INTO chug_times (id, year_id, team_id, chug_1, chug_2, average, notes)
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
  console.log(`Imported ${chugTimesData.length} chug times`);
} catch (error) {
  console.log("No chug times data to import");
}

// Import golf scores
try {
  const golfScoresData = JSON.parse(readFileSync(path.join(dataDir, "golf_scores.json"), "utf-8"));
  const insertGolfScore = sqlite.prepare(`
    INSERT INTO golf_scores (id, year_id, team_id, score, notes)
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
  console.log(`Imported ${golfScoresData.length} golf scores`);
} catch (error) {
  console.log("No golf scores data to import");
}

console.log("\nDatabase migration completed successfully!");
sqlite.close();
