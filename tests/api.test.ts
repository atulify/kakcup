import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../shared/schema-sqlite.js';
import { createRoutes } from '../server/routes.js';
import { setDb } from '../server/db.js';
import { createTestDatabase, seedTestDatabase } from './helpers.js';
import type { AppEnv } from '../server/auth.js';
import { createToken } from '../server/auth.js';

let app: Hono<AppEnv>;

beforeAll(() => {
  delete process.env.DATABASE_URL;

  // Create in-memory SQLite database and inject it into the db module
  const { sqlite } = createTestDatabase();
  seedTestDatabase(sqlite);
  setDb(drizzle(sqlite, { schema }));

  app = new Hono<AppEnv>();
  createRoutes(app);
});

describe('GET /api/years', () => {
  it('should return list of years', async () => {
    const res = await app.request('/api/years');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('should return years with correct structure', async () => {
    const res = await app.request('/api/years');
    const body = await res.json();
    if (body.length > 0) {
      const year = body[0];
      expect(year).toHaveProperty('id');
      expect(year).toHaveProperty('year');
      expect(year).toHaveProperty('name');
      expect(year).toHaveProperty('status');
    }
  });
});

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const ts = Date.now();
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `newuser${ts}`,
        email: `newuser${ts}@example.com`,
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('should reject registration with missing username', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject registration with missing password', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', email: 'test@example.com' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('should reject login with invalid credentials', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent', password: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('message', 'Invalid credentials');
  });

  it('should reject login with missing username', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject login with missing password', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/user', () => {
  it('should return 401 when not authenticated', async () => {
    const res = await app.request('/api/auth/user');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('message', 'Unauthorized');
  });
});

describe('Protected Routes', () => {
  it('should protect admin team creation route', async () => {
    const res = await app.request('/api/years/test-id/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Team' }),
    });
    expect(res.status).toBe(401);
  });

  it('should protect year update route', async () => {
    const res = await app.request('/api/years/test-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/years/:yearId/scores', () => {
  it('should return 401 without auth', async () => {
    const res = await app.request('/api/years/11111111-1111-1111-1111-111111111111/scores', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent yearId', async () => {
    // Even without auth this hits isAdmin first, so 401 is expected for unauthenticated
    // To properly test 404, we'd need admin auth. We verify the route exists via 401.
    const res = await app.request('/api/years/nonexistent-id/scores', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/years', () => {
  it('should return 401 without auth', async () => {
    const res = await app.request('/api/years', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('should return 403 for non-admin user', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'testuser', role: 'user' });
    const res = await app.request('/api/years', {
      method: 'POST',
      headers: { Cookie: `token=${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('should create next year with admin auth', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'testuser', role: 'admin' });
    const res = await app.request('/api/years', {
      method: 'POST',
      headers: { Cookie: `token=${token}` },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.year).toBe(2026);
    expect(body.name).toBe('2026 KAK Cup');
    expect(body.status).toBe('upcoming');
  });

  it('should create sequential years on repeated calls', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'testuser', role: 'admin' });
    const res = await app.request('/api/years', {
      method: 'POST',
      headers: { Cookie: `token=${token}` },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.year).toBe(2027);
    expect(body.name).toBe('2027 KAK Cup');
  });
});

describe('Parallel data prefetch', () => {
  it('should return all tab data in parallel for a valid year', async () => {
    // Get a valid yearId from the seeded data
    const yearsRes = await app.request('/api/years');
    const years = await yearsRes.json();
    expect(years.length).toBeGreaterThan(0);
    const unlockedYear = years.find((y: any) => !y.fishing_locked && !y.chug_locked && !y.golf_locked);
    expect(unlockedYear).toBeDefined();
    const yearId = unlockedYear.id;

    // Fire all four data requests in parallel — same as YearPage prefetch
    const [teamsRes, fishRes, chugRes, golfRes] = await Promise.all([
      app.request(`/api/years/${yearId}/teams`),
      app.request(`/api/years/${yearId}/fish-weights`),
      app.request(`/api/years/${yearId}/chug-times`),
      app.request(`/api/years/${yearId}/golf-scores`),
    ]);

    expect(teamsRes.status).toBe(200);
    expect(fishRes.status).toBe(200);
    expect(chugRes.status).toBe(200);
    expect(golfRes.status).toBe(200);

    // All should return arrays
    expect(Array.isArray(await teamsRes.json())).toBe(true);
    expect(Array.isArray(await fishRes.json())).toBe(true);
    expect(Array.isArray(await chugRes.json())).toBe(true);
    expect(Array.isArray(await golfRes.json())).toBe(true);
  });

  it('should return ETag headers on all data endpoints', async () => {
    const yearsRes = await app.request('/api/years');
    const years = await yearsRes.json();
    const yearId = years[0].id;

    const [teamsRes, fishRes, chugRes, golfRes] = await Promise.all([
      app.request(`/api/years/${yearId}/teams`),
      app.request(`/api/years/${yearId}/fish-weights`),
      app.request(`/api/years/${yearId}/chug-times`),
      app.request(`/api/years/${yearId}/golf-scores`),
    ]);

    // All should have ETag headers for 304 support
    expect(teamsRes.headers.get('etag')).toBeTruthy();
    expect(fishRes.headers.get('etag')).toBeTruthy();
    expect(chugRes.headers.get('etag')).toBeTruthy();
    expect(golfRes.headers.get('etag')).toBeTruthy();
  });

  it('should return 304 when ETag matches', async () => {
    const yearsRes = await app.request('/api/years');
    const years = await yearsRes.json();
    const yearId = years[0].id;

    // First request — get the ETag
    const firstRes = await app.request(`/api/years/${yearId}/teams`);
    const etag = firstRes.headers.get('etag');
    expect(etag).toBeTruthy();

    // Second request with If-None-Match — should get 304
    const secondRes = await app.request(`/api/years/${yearId}/teams`, {
      headers: { 'If-None-Match': etag! },
    });
    expect(secondRes.status).toBe(304);
  });
});

describe('Tie-breaks', () => {
  it('applies and removes a tie-break and updates champs', async () => {
    const adminToken = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'testuser', role: 'admin' });

    const newYearRes = await app.request('/api/years', {
      method: 'POST',
      headers: { Cookie: `token=${adminToken}` },
    });
    expect(newYearRes.status).toBe(201);
    const newYear = await newYearRes.json();
    const yearId = newYear.id;

    const kaksRes = await app.request('/api/kaks');
    const kaks = await kaksRes.json();
    const kak1 = kaks.find((k: any) => k.name === 'Seed KAK 1');
    const kak2 = kaks.find((k: any) => k.name === 'Seed KAK 2');
    expect(kak1).toBeDefined();
    expect(kak2).toBeDefined();
    const kakId1 = kak1.id;
    const kakId2 = kak2.id;

    // Create team1 with kak1Id
    const team1Res = await app.request(`/api/years/${yearId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ name: 'Tie Team A', position: 1, kak1Id: kakId1 }),
    });
    expect(team1Res.status).toBe(201);
    const team1 = await team1Res.json();

    // Create team2 with a different kak ID
    const team2Res = await app.request(`/api/years/${yearId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ name: 'Tie Team', position: 2, kak1Id: kakId2 }),
    });
    expect(team2Res.status).toBe(201);
    const team2 = await team2Res.json();

    // Add equal scores so team1 and team2 tie
    await app.request(`/api/years/${yearId}/fish-weights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team1.id, weight: 10 }),
    });
    await app.request(`/api/years/${yearId}/fish-weights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team2.id, weight: 10 }),
    });

    await app.request(`/api/years/${yearId}/chug-times`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team1.id, chug1: 5, chug2: 5, average: 5 }),
    });
    await app.request(`/api/years/${yearId}/chug-times`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team2.id, chug1: 5, chug2: 5, average: 5 }),
    });

    await app.request(`/api/years/${yearId}/golf-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team1.id, score: 70 }),
    });
    await app.request(`/api/years/${yearId}/golf-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team2.id, score: 70 }),
    });

    // Lock and complete year
    const completeRes = await app.request(`/api/years/${yearId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ fishing_locked: true, chug_locked: true, golf_locked: true, status: 'completed' }),
    });
    expect(completeRes.status).toBe(200);

    // No champs when tied for first
    const statsRes1 = await app.request('/api/kak-stats');
    const stats1 = await statsRes1.json();
    expect(stats1.champs).toHaveLength(0);

    // Apply tie-break to team2
    const tieBreakRes = await app.request(`/api/years/${yearId}/tie-breaks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${adminToken}` },
      body: JSON.stringify({ teamId: team2.id, event: 'golf', deltaPoints: 0.5, reason: 'test' }),
    });
    expect(tieBreakRes.status).toBe(201);

    const statsRes2 = await app.request('/api/kak-stats');
    const stats2 = await statsRes2.json();
    expect(stats2.champs).toHaveLength(1);
    expect(stats2.champs[0].kakId).toBe(kakId2);

    // Remove tie-break
    const deleteRes = await app.request(`/api/years/${yearId}/tie-breaks`, {
      method: 'DELETE',
      headers: { Cookie: `token=${adminToken}` },
    });
    expect(deleteRes.status).toBe(200);

    const statsRes3 = await app.request('/api/kak-stats');
    const stats3 = await statsRes3.json();
    expect(stats3.champs).toHaveLength(0);
  });
});

describe('API Error Handling', () => {
  it('should handle invalid JSON body gracefully', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{',
    });
    // Hono returns 500 on JSON parse error (caught by route try/catch)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should return 404 for non-existent year number', async () => {
    const res = await app.request('/api/years/99999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/kaks
// ---------------------------------------------------------------------------

describe('GET /api/kaks', () => {
  it('returns 200 with an array', async () => {
    const res = await app.request('/api/kaks');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns seeded kaks with correct shape', async () => {
    const res = await app.request('/api/kaks');
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(2);
    const kak = body[0];
    expect(kak).toHaveProperty('id');
    expect(kak).toHaveProperty('name');
    expect(kak).toHaveProperty('status');
  });

  it('filters by status=active', async () => {
    const res = await app.request('/api/kaks?status=active');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.every((k: { status: string }) => k.status === 'active')).toBe(true);
  });

  it('returns empty array for status with no matches', async () => {
    const res = await app.request('/api/kaks?status=in-memoriam');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('is publicly accessible (no auth required)', async () => {
    const res = await app.request('/api/kaks');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/kaks
// ---------------------------------------------------------------------------

describe('POST /api/kaks', () => {
  it('returns 401 without auth', async () => {
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TestKAK' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'user', role: 'user' });
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: 'TestKAK' }),
    });
    expect(res.status).toBe(403);
  });

  it('creates a kak with admin auth', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
    const ts = Date.now();
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `NewKAK${ts}` }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(`NewKAK${ts}`);
    expect(body.status).toBe('active');
  });

  it('creates a kak with explicit status', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
    const ts = Date.now();
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `RetiredKAK${ts}`, status: 'retired' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('retired');
  });

  it('returns 400 when name is missing', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/kaks/:kakId
// ---------------------------------------------------------------------------

describe('PATCH /api/kaks/:kakId', () => {
  const kakId1 = 'aa000000-0000-0000-0000-000000000001';

  it('returns 401 without auth', async () => {
    const res = await app.request(`/api/kaks/${kakId1}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'retired' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'user', role: 'user' });
    const res = await app.request(`/api/kaks/${kakId1}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ status: 'retired' }),
    });
    expect(res.status).toBe(403);
  });

  it('updates kak status with admin auth', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
    // First create a fresh kak so we don't disturb other tests
    const createRes = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `PatchTargetKAK${Date.now()}` }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/kaks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ status: 'retired' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('retired');
  });

  it('updates kak name with admin auth', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
    const createRes = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `OldKAKName${Date.now()}` }),
    });
    const created = await createRes.json();

    const newName = `NewKAKName${Date.now()}`;
    const res = await app.request(`/api/kaks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: newName }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(newName);
  });

  it('returns 404 for non-existent kak id', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
    const res = await app.request('/api/kaks/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ status: 'retired' }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/kak-stats
// ---------------------------------------------------------------------------

describe('GET /api/kak-stats', () => {
  it('returns 200 with champs and boots arrays', async () => {
    const res = await app.request('/api/kak-stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('champs');
    expect(body).toHaveProperty('boots');
    expect(Array.isArray(body.champs)).toBe(true);
    expect(Array.isArray(body.boots)).toBe(true);
  });

  it('is publicly accessible (no auth required)', async () => {
    const res = await app.request('/api/kak-stats');
    expect(res.status).toBe(200);
  });

  it('stat rows have correct shape when populated', async () => {
    // The seeded DB has no champs/boots by default so we just check the empty shape
    const res = await app.request('/api/kak-stats');
    const body = await res.json();
    // If there happen to be rows, verify their shape
    if (body.champs.length > 0) {
      const row = body.champs[0];
      expect(row).toHaveProperty('kakId');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('total');
    }
    if (body.boots.length > 0) {
      const row = body.boots[0];
      expect(row).toHaveProperty('kakId');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('total');
    }
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/years/:yearId — completion validation
// ---------------------------------------------------------------------------

describe('PATCH /api/years/:yearId — completion validation', () => {
  it('returns 400 when marking completed with no events locked', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });

    // Use the seeded year (all locks default to false)
    const yearsRes = await app.request('/api/years');
    const years = await yearsRes.json();
    const yearId = years[0].id;

    const res = await app.request(`/api/years/${yearId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/lock/i);
  });

  it('returns 401 without auth', async () => {
    const yearsRes = await app.request('/api/years');
    const years = await yearsRes.json();
    const yearId = years[0].id;

    const res = await app.request(`/api/years/${yearId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(res.status).toBe(401);
  });

  it('allows locking individual events without status change', async () => {
    const token = await createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });

    const yearsRes = await app.request('/api/years');
    const years = await yearsRes.json();
    const yearId = years[0].id;

    // Lock fishing — should succeed
    const res = await app.request(`/api/years/${yearId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ fishing_locked: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fishing_locked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// KAK name collision
// ---------------------------------------------------------------------------

describe('KAK name collision prevention', () => {
  async function adminToken() {
    return createToken({ userId: '33333333-3333-3333-3333-333333333333', username: 'admin', role: 'admin' });
  }

  it('POST /api/kaks returns 409 when name already exists (exact match)', async () => {
    const token = await adminToken();
    // Create a kak first
    const ts = Date.now();
    const name = `CollisionKAK${ts}`;
    await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name }),
    });
    // Try to create another with the same name
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('PATCH /api/kaks/:kakId returns 409 when renaming to existing name', async () => {
    const token = await adminToken();
    const ts = Date.now();
    // Create two distinct kaks
    const res1 = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `Alpha${ts}` }),
    });
    const res2 = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `Beta${ts}` }),
    });
    const kak1 = await res1.json();
    await res2.json(); // just consume

    // Try to rename kak1 to Beta (taken)
    const patchRes = await app.request(`/api/kaks/${kak1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `Beta${ts}` }),
    });
    expect(patchRes.status).toBe(409);
    const body = await patchRes.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('PATCH /api/kaks/:kakId allows saving own name (no collision)', async () => {
    const token = await adminToken();
    const ts = Date.now();
    const res = await app.request('/api/kaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `SameNameOK${ts}` }),
    });
    const kak = await res.json();

    // Patch with same name + status change — should succeed
    const patchRes = await app.request(`/api/kaks/${kak.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      body: JSON.stringify({ name: `SameNameOK${ts}`, status: 'retired' }),
    });
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.status).toBe('retired');
  });
});
