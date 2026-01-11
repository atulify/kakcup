import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { registerRoutes } from '../server/routes.js';
import { createTestDatabase, seedTestDatabase } from './helpers.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('API Integration Tests', () => {
  let app: Express;
  let server: any;
  let testDbPath: string;

  beforeAll(async () => {
    // Set up test database
    delete process.env.DATABASE_URL; // Ensure we use SQLite for tests

    testDbPath = path.resolve(__dirname, '../test-api.db');

    // Create test database
    const sqlite = new Database(testDbPath);

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

    // Seed data
    seedTestDatabase(sqlite);

    sqlite.close();

    // Set up Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    server = await registerRoutes(app);
  });

  afterAll(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('GET /api/years', () => {
    it('should return list of years', async () => {
      const response = await request(app).get('/api/years');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return years with correct structure', async () => {
      const response = await request(app).get('/api/years');

      if (response.body.length > 0) {
        const year = response.body[0];
        expect(year).toHaveProperty('id');
        expect(year).toHaveProperty('year');
        expect(year).toHaveProperty('name');
        expect(year).toHaveProperty('status');
      }
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const newUser = {
        username: 'newuser' + Date.now(), // Unique username
        email: `newuser${Date.now()}@example.com`, // Unique email
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username', newUser.username);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('should reject registration with missing username', async () => {
      const invalidUser = {
        email: 'test@example.com',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUser);

      expect(response.status).toBe(400);
    });

    it('should reject registration with missing password', async () => {
      const invalidUser = {
        username: 'testuser',
        email: 'test@example.com',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUser);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject login with invalid credentials', async () => {
      const credentials = {
        username: 'nonexistent',
        password: 'wrongpassword',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should reject login with missing username', async () => {
      const credentials = {
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(response.status).toBe(400);
    });

    it('should reject login with missing password', async () => {
      const credentials = {
        username: 'testuser',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/user', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/auth/user');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Unauthorized');
    });
  });

  describe('Protected Routes', () => {
    it('should protect admin routes', async () => {
      const response = await request(app)
        .post('/api/years/test-id/teams')
        .send({ name: 'Test Team' });

      expect(response.status).toBe(401);
    });

    it('should protect year update routes', async () => {
      const response = await request(app)
        .patch('/api/years/test-id')
        .send({ status: 'completed' });

      expect(response.status).toBe(401);
    });
  });
});

describe('API Error Handling', () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);
  });

  it('should handle invalid JSON', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('invalid json{');

    expect(response.status).toBe(400);
  });

  it('should handle non-existent year', async () => {
    const response = await request(app).get('/api/years/99999');

    expect(response.status).toBe(404);
  });
});
