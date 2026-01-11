import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates a test SQLite database
 */
export function createTestDatabase() {
  // Use a unique database file for each test to avoid conflicts
  const dbPath = path.resolve(__dirname, `../test-${Date.now()}-${Math.random()}.db`);

  const sqlite = new Database(dbPath, {
    readonly: false,
    fileMustExist: false,
  });

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" TEXT PRIMARY KEY,
      "sess" TEXT NOT NULL,
      "expire" INTEGER NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS "golf_scores" (
      "id" TEXT PRIMARY KEY,
      "year_id" TEXT NOT NULL,
      "team_id" TEXT NOT NULL,
      "score" INTEGER,
      "notes" TEXT
    );
  `);

  return { sqlite, db: drizzle(sqlite), dbPath };
}

/**
 * Seeds test database with sample data
 */
export function seedTestDatabase(sqlite: Database.Database) {
  // Insert a test year
  const yearId = '11111111-1111-1111-1111-111111111111';
  sqlite.prepare(`
    INSERT INTO years (id, year, name, status, fishing_locked)
    VALUES (?, ?, ?, ?, ?)
  `).run(yearId, 2025, 'Test Year 2025', 'active', 0);

  // Insert a test team
  const teamId = '22222222-2222-2222-2222-222222222222';
  sqlite.prepare(`
    INSERT INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(teamId, yearId, 'Test Team', 1, 'Player 1', 'Player 2', 'Player 3', 'Player 4', 0);

  // Insert a test user
  const userId = '33333333-3333-3333-3333-333333333333';
  sqlite.prepare(`
    INSERT INTO users (id, username, email, password_hash, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    'testuser',
    'test@example.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5F3L.vHKNEVx2', // "password"
    'Test',
    'User',
    'user',
    Date.now(),
    Date.now()
  );

  return { yearId, teamId, userId };
}

/**
 * Creates a mock Express request object
 */
export function createMockRequest(overrides: any = {}) {
  return {
    body: {},
    params: {},
    query: {},
    session: {},
    ...overrides,
  };
}

/**
 * Creates a mock Express response object
 */
export function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {},
    data: null,
  };

  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data: any) => {
    res.data = data;
    return res;
  };

  res.send = (data: any) => {
    res.data = data;
    return res;
  };

  res.setHeader = (key: string, value: string) => {
    res.headers[key] = value;
    return res;
  };

  return res;
}
