import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../shared/schema-sqlite.js';
import { DatabaseStorage } from '../server/storage.js';
import { setDb } from '../server/db.js';
import { createTestDatabase, seedTestDatabase } from './helpers.js';

function setup() {
  const { sqlite } = createTestDatabase();
  setDb(drizzle(sqlite, { schema }));
  return { sqlite, store: new DatabaseStorage() };
}

// ---------------------------------------------------------------------------
// getKaks
// ---------------------------------------------------------------------------

describe('storage.getKaks', () => {
  let sqlite: Database.Database;
  let store: DatabaseStorage;

  beforeEach(() => {
    ({ sqlite, store } = setup());
    seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('returns all kaks when no status filter given', async () => {
    const all = await store.getKaks();
    // seed inserts 2 kaks
    expect(all.length).toBe(2);
  });

  it('returns only active kaks when status=active', async () => {
    // Make one kak inactive
    sqlite.prepare(`INSERT INTO kaks (id, name, status) VALUES (?, ?, ?)`)
      .run(crypto.randomUUID(), 'Retired One', 'retired');

    const active = await store.getKaks('active');
    expect(active.every(k => k.status === 'active')).toBe(true);
    expect(active.length).toBe(2); // only the 2 seeded active ones
  });

  it('returns empty when no kaks match status filter', async () => {
    const result = await store.getKaks('in-memoriam');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createKak
// ---------------------------------------------------------------------------

describe('storage.createKak', () => {
  let sqlite: Database.Database;
  let store: DatabaseStorage;

  beforeEach(() => {
    ({ sqlite, store } = setup());
  });

  afterEach(() => { sqlite.close(); });

  it('creates a kak with default active status', async () => {
    const kak = await store.createKak({ name: 'NewKAK' });
    expect(kak.name).toBe('NewKAK');
    expect(kak.status).toBe('active');
    expect(kak.id).toBeTruthy();
  });

  it('creates a kak with explicit status', async () => {
    const kak = await store.createKak({ name: 'RetiredKAK', status: 'retired' });
    expect(kak.status).toBe('retired');
  });

  it('returns the created kak', async () => {
    const kak = await store.createKak({ name: 'ReturnedKAK' });
    expect(kak).toHaveProperty('id');
    expect(kak).toHaveProperty('name');
    expect(kak).toHaveProperty('status');
  });
});

// ---------------------------------------------------------------------------
// updateKak
// ---------------------------------------------------------------------------

describe('storage.updateKak', () => {
  let sqlite: Database.Database;
  let store: DatabaseStorage;

  beforeEach(() => {
    ({ sqlite, store } = setup());
  });

  afterEach(() => { sqlite.close(); });

  it('updates kak status', async () => {
    const created = await store.createKak({ name: 'MurKAK', status: 'active' });
    const updated = await store.updateKak(created.id, { status: 'retired' });
    expect(updated.status).toBe('retired');
  });

  it('updates kak name', async () => {
    const created = await store.createKak({ name: 'OldName' });
    const updated = await store.updateKak(created.id, { name: 'NewName' });
    expect(updated.name).toBe('NewName');
  });
});

// ---------------------------------------------------------------------------
// getKakStats
// ---------------------------------------------------------------------------

describe('storage.getKakStats', () => {
  let sqlite: Database.Database;
  let store: DatabaseStorage;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, store } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('returns empty arrays when no champs or boots exist', async () => {
    const stats = await store.getKakStats();
    expect(stats.champs).toHaveLength(0);
    expect(stats.boots).toHaveLength(0);
  });

  it('counts champ appearances correctly', async () => {
    const { kakId1, kakId2, yearId } = seedIds;
    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked, chug_locked, golf_locked) VALUES (?, ?, ?, ?, 0, 0, 0)`)
      .run(yearId2, 2026, 'Test 2026', 'upcoming');

    // kakId1 wins twice, kakId2 once
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId1);
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId2, kakId1);
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId2);

    const stats = await store.getKakStats();
    const k1 = stats.champs.find(r => r.kakId === kakId1);
    const k2 = stats.champs.find(r => r.kakId === kakId2);
    expect(k1?.total).toBe(2);
    expect(k2?.total).toBe(1);
  });

  it('returns champs sorted by count descending', async () => {
    const { kakId1, kakId2, yearId } = seedIds;
    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked, chug_locked, golf_locked) VALUES (?, ?, ?, ?, 0, 0, 0)`)
      .run(yearId2, 2026, 'Test 2026', 'upcoming');

    // kakId1 = 2 wins, kakId2 = 1 win
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId1);
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId2, kakId1);
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId2);

    const stats = await store.getKakStats();
    expect(stats.champs[0].kakId).toBe(kakId1);
    expect(stats.champs[1].kakId).toBe(kakId2);
  });

  it('counts boot appearances correctly', async () => {
    const { kakId1, kakId2, yearId } = seedIds;

    sqlite.prepare(`INSERT INTO boots (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId1);
    sqlite.prepare(`INSERT INTO boots (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId2);

    const stats = await store.getKakStats();
    expect(stats.boots).toHaveLength(2);
    expect(stats.boots.every(r => r.total === 1)).toBe(true);
  });

  it('includes kak name in stats rows', async () => {
    const { kakId1, yearId } = seedIds;
    sqlite.prepare(`INSERT INTO champs (id, year_id, kak_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), yearId, kakId1);

    const stats = await store.getKakStats();
    expect(stats.champs[0].name).toBe('Seed KAK 1');
  });
});

// ---------------------------------------------------------------------------
// setChampsAndBoots
// ---------------------------------------------------------------------------

describe('storage.setChampsAndBoots', () => {
  let sqlite: Database.Database;
  let store: DatabaseStorage;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, store } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('inserts champs and boots for a year', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;
    await store.setChampsAndBoots(yearId, [kakId1], [kakId2]);

    const champRows = sqlite.prepare(`SELECT * FROM champs WHERE year_id = ?`).all(yearId);
    const bootRows = sqlite.prepare(`SELECT * FROM boots WHERE year_id = ?`).all(yearId);
    expect(champRows).toHaveLength(1);
    expect(bootRows).toHaveLength(1);
  });

  it('clears existing entries before inserting (idempotent)', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;

    await store.setChampsAndBoots(yearId, [kakId1], [kakId2]);
    // Run again — should replace, not duplicate
    await store.setChampsAndBoots(yearId, [kakId1], [kakId2]);

    const champRows = sqlite.prepare(`SELECT * FROM champs WHERE year_id = ?`).all(yearId);
    expect(champRows).toHaveLength(1);
  });

  it('supports multiple champ kak ids (full team)', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;
    const kakId3 = crypto.randomUUID();
    const kakId4 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO kaks (id, name, status) VALUES (?, ?, 'active')`).run(kakId3, 'KAK 3');
    sqlite.prepare(`INSERT INTO kaks (id, name, status) VALUES (?, ?, 'active')`).run(kakId4, 'KAK 4');

    await store.setChampsAndBoots(yearId, [kakId1, kakId2, kakId3, kakId4], []);

    const champRows = sqlite.prepare(`SELECT * FROM champs WHERE year_id = ?`).all(yearId);
    expect(champRows).toHaveLength(4);
  });

  it('handles empty boot list gracefully', async () => {
    const { yearId, kakId1 } = seedIds;
    await expect(store.setChampsAndBoots(yearId, [kakId1], [])).resolves.not.toThrow();

    const bootRows = sqlite.prepare(`SELECT * FROM boots WHERE year_id = ?`).all(yearId);
    expect(bootRows).toHaveLength(0);
  });

  it('handles empty champ list gracefully', async () => {
    const { yearId, kakId2 } = seedIds;
    await expect(store.setChampsAndBoots(yearId, [], [kakId2])).resolves.not.toThrow();

    const champRows = sqlite.prepare(`SELECT * FROM champs WHERE year_id = ?`).all(yearId);
    expect(champRows).toHaveLength(0);
  });
});
