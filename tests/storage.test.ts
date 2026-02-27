import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase, seedTestDatabase } from './helpers.js';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { users, years, teams, fishWeights, chugTimes, golfScores } from '../shared/schema-sqlite.js';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { DatabaseStorage } from '../server/storage.js';
import { setDb } from '../server/db.js';

describe('Storage Layer - User Operations', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let dbPath: string;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
    dbPath = testDb.dbPath;
    db = drizzle(sqlite, { schema: { users, years, teams, fishWeights, chugTimes, golfScores } });
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('should create a new user', async () => {
    const userId = crypto.randomUUID();
    const newUser = {
      id: userId,
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(users).values(newUser);

    const foundUser = await db.select().from(users).where(eq(users.id, userId));
    expect(foundUser).toHaveLength(1);
    expect(foundUser[0].username).toBe('testuser');
    expect(foundUser[0].email).toBe('test@example.com');
  });

  it('should find user by username', async () => {
    seedTestDatabase(sqlite);

    const foundUser = await db.select().from(users).where(eq(users.username, 'testuser'));
    expect(foundUser).toHaveLength(1);
    expect(foundUser[0].username).toBe('testuser');
  });

  it('should find user by email', async () => {
    seedTestDatabase(sqlite);

    const foundUser = await db.select().from(users).where(eq(users.email, 'test@example.com'));
    expect(foundUser).toHaveLength(1);
    expect(foundUser[0].email).toBe('test@example.com');
  });

  it('should enforce unique username constraint', async () => {
    const user1 = {
      id: crypto.randomUUID(),
      username: 'duplicate',
      email: 'user1@example.com',
      passwordHash: 'hash1',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const user2 = {
      id: crypto.randomUUID(),
      username: 'duplicate',
      email: 'user2@example.com',
      passwordHash: 'hash2',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(users).values(user1);

    // Should throw due to unique constraint
    await expect(db.insert(users).values(user2)).rejects.toThrow();
  });
});

describe('Storage Layer - Year Operations', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let dbPath: string;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
    dbPath = testDb.dbPath;
    db = drizzle(sqlite, { schema: { users, years, teams, fishWeights, chugTimes, golfScores } });
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('should create a new year', async () => {
    const yearId = crypto.randomUUID();
    const newYear = {
      id: yearId,
      year: 2025,
      name: 'KAK Cup 2025',
      status: 'upcoming',
      fishing_locked: false,
    };

    await db.insert(years).values(newYear);

    const foundYear = await db.select().from(years).where(eq(years.id, yearId));
    expect(foundYear).toHaveLength(1);
    expect(foundYear[0].year).toBe(2025);
  });

  it('should find year by year number', async () => {
    seedTestDatabase(sqlite);

    const foundYear = await db.select().from(years).where(eq(years.year, 2025));
    expect(foundYear).toHaveLength(1);
    expect(foundYear[0].name).toBe('Test Year 2025');
  });

  it('should update year status', async () => {
    const { yearId } = seedTestDatabase(sqlite);

    await db.update(years).set({ status: 'completed' }).where(eq(years.id, yearId));

    const updatedYear = await db.select().from(years).where(eq(years.id, yearId));
    expect(updatedYear[0].status).toBe('completed');
  });

  it('should update fishing_locked flag', async () => {
    const { yearId } = seedTestDatabase(sqlite);

    await db.update(years).set({ fishing_locked: true }).where(eq(years.id, yearId));

    const updatedYear = await db.select().from(years).where(eq(years.id, yearId));
    // Drizzle returns boolean true, not SQLite's internal 1
    expect(updatedYear[0].fishing_locked).toBe(true);
  });
});

describe('Storage Layer - Team Operations', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let dbPath: string;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
    dbPath = testDb.dbPath;
    db = drizzle(sqlite, { schema: { users, years, teams, fishWeights, chugTimes, golfScores } });
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('should create a new team', async () => {
    const { yearId } = seedTestDatabase(sqlite);
    const teamId = crypto.randomUUID();

    const newTeam = {
      id: teamId,
      yearId: yearId,
      name: 'New Team',
      position: 2,
      kak1: 'Player A',
      kak2: 'Player B',
      kak3: 'Player C',
      kak4: 'Player D',
      locked: false,
    };

    await db.insert(teams).values(newTeam);

    const foundTeam = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(foundTeam).toHaveLength(1);
    expect(foundTeam[0].name).toBe('New Team');
  });

  it('should find teams by year', async () => {
    const { yearId } = seedTestDatabase(sqlite);

    const foundTeams = await db.select().from(teams).where(eq(teams.yearId, yearId));
    expect(foundTeams.length).toBeGreaterThan(0);
    expect(foundTeams[0].yearId).toBe(yearId);
  });

  it('should update team members', async () => {
    const { teamId } = seedTestDatabase(sqlite);

    await db.update(teams).set({ kak1: 'Updated Player' }).where(eq(teams.id, teamId));

    const updatedTeam = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(updatedTeam[0].kak1).toBe('Updated Player');
  });
});

describe('Storage Layer - Competition Data', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let dbPath: string;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
    dbPath = testDb.dbPath;
    db = drizzle(sqlite, { schema: { users, years, teams, fishWeights, chugTimes, golfScores } });
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('should create fish weight entry', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);
    const weightId = crypto.randomUUID();

    const fishWeight = {
      id: weightId,
      yearId: yearId,
      teamId: teamId,
      weight: 12.5,
      notes: 'Caught at sunrise',
    };

    await db.insert(fishWeights).values(fishWeight);

    const found = await db.select().from(fishWeights).where(eq(fishWeights.id, weightId));
    expect(found).toHaveLength(1);
    expect(parseFloat(found[0].weight as any)).toBeCloseTo(12.5, 1);
  });

  it('should create chug time entry', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);
    const chugId = crypto.randomUUID();

    const chugTime = {
      id: chugId,
      yearId: yearId,
      teamId: teamId,
      chug1: 8.5,
      chug2: 9.2,
      average: 8.85,
      notes: 'Good performance',
    };

    await db.insert(chugTimes).values(chugTime);

    const found = await db.select().from(chugTimes).where(eq(chugTimes.id, chugId));
    expect(found).toHaveLength(1);
    expect(parseFloat(found[0].average as any)).toBeCloseTo(8.85, 2);
  });

  it('should create golf score entry', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);
    const golfId = crypto.randomUUID();

    const golfScore = {
      id: golfId,
      yearId: yearId,
      teamId: teamId,
      score: 72,
      notes: 'Par round',
    };

    await db.insert(golfScores).values(golfScore);

    const found = await db.select().from(golfScores).where(eq(golfScores.id, golfId));
    expect(found).toHaveLength(1);
    expect(found[0].score).toBe(72);
  });

  it('should query fish weights by year', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);

    await db.insert(fishWeights).values({
      id: crypto.randomUUID(),
      yearId: yearId,
      teamId: teamId,
      weight: 10.5,
      notes: 'Test fish',
    });

    const weights = await db.select().from(fishWeights).where(eq(fishWeights.yearId, yearId));
    expect(weights.length).toBeGreaterThan(0);
  });
});

describe('Storage Layer - Upsert Behaviour', () => {
  let sqlite: Database.Database;
  let store: DatabaseStorage;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
    setDb(drizzle(sqlite, { schema: { users, years, teams, fishWeights, chugTimes, golfScores } }));
    store = new DatabaseStorage();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('createChugTime should update existing row rather than insert a duplicate', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);

    await store.createChugTime({ id: crypto.randomUUID(), yearId, teamId, chug1: 8.5, chug2: 9.2, average: 8.85, notes: 'First' });
    await store.createChugTime({ id: crypto.randomUUID(), yearId, teamId, chug1: 7.0, chug2: 7.5, average: 7.25, notes: 'Updated' });

    const rows = await store.getChugTimesByYear(yearId);
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0].chug1 as any)).toBeCloseTo(7.0, 1);
    expect(parseFloat(rows[0].average as any)).toBeCloseTo(7.25, 2);
    expect(rows[0].notes).toBe('Updated');
  });

  it('createGolfScore should update existing row rather than insert a duplicate', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);

    await store.createGolfScore({ id: crypto.randomUUID(), yearId, teamId, score: 85, notes: 'First round' });
    await store.createGolfScore({ id: crypto.randomUUID(), yearId, teamId, score: 72, notes: 'Better round' });

    const rows = await store.getGolfScoresByYear(yearId);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(72);
    expect(rows[0].notes).toBe('Better round');
  });

  it('createChugTime should allow different teams to each have their own row', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);
    const teamId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO teams (id, year_id, name, position, locked) VALUES (?, ?, ?, ?, ?)`)
      .run(teamId2, yearId, 'Team 2', 2, 0);

    await store.createChugTime({ id: crypto.randomUUID(), yearId, teamId, chug1: 8.0, chug2: 8.0, average: 8.0 });
    await store.createChugTime({ id: crypto.randomUUID(), yearId, teamId: teamId2, chug1: 9.0, chug2: 9.0, average: 9.0 });

    const rows = await store.getChugTimesByYear(yearId);
    expect(rows).toHaveLength(2);
  });

  it('createGolfScore should allow different teams to each have their own row', async () => {
    const { yearId, teamId } = seedTestDatabase(sqlite);
    const teamId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO teams (id, year_id, name, position, locked) VALUES (?, ?, ?, ?, ?)`)
      .run(teamId2, yearId, 'Team 2', 2, 0);

    await store.createGolfScore({ id: crypto.randomUUID(), yearId, teamId, score: 80 });
    await store.createGolfScore({ id: crypto.randomUUID(), yearId, teamId: teamId2, score: 75 });

    const rows = await store.getGolfScoresByYear(yearId);
    expect(rows).toHaveLength(2);
  });
});
