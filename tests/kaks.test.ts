import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, and, count } from 'drizzle-orm';
import { createTestDatabase, seedTestDatabase } from './helpers.js';
import { kaks, teams, years, champs, boots } from '../shared/schema-sqlite.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  const { sqlite, db } = createTestDatabase();
  return { sqlite, db: drizzle(sqlite, { schema: { kaks, teams, years, champs, boots } }) };
}

// ---------------------------------------------------------------------------
// kaks table — basic CRUD
// ---------------------------------------------------------------------------

describe('kaks table — CRUD', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
  });

  afterEach(() => { sqlite.close(); });

  it('inserts a KAK with default active status', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'Bopper' });

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Bopper');
    expect(rows[0].status).toBe('active');
  });

  it('inserts a KAK with explicit inactive status', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'OldTimer', status: 'inactive' });

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows[0].status).toBe('inactive');
  });

  it('inserts a KAK with retired status', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'Legend', status: 'retired' });

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows[0].status).toBe('retired');
  });

  it('inserts a KAK with in-memoriam status', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'TBone', status: 'in-memoriam' });

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows[0].status).toBe('in-memoriam');
  });

  it('updates a KAK status', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'Murr', status: 'active' });
    await db.update(kaks).set({ status: 'retired' }).where(eq(kaks.id, id));

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows[0].status).toBe('retired');
  });

  it('updates a KAK name', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'OldName' });
    await db.update(kaks).set({ name: 'NewName' }).where(eq(kaks.id, id));

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows[0].name).toBe('NewName');
  });

  it('deletes a KAK', async () => {
    const id = crypto.randomUUID();
    await db.insert(kaks).values({ id, name: 'Temporary' });
    await db.delete(kaks).where(eq(kaks.id, id));

    const rows = await db.select().from(kaks).where(eq(kaks.id, id));
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// kaks table — constraints
// ---------------------------------------------------------------------------

describe('kaks table — constraints', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
  });

  afterEach(() => { sqlite.close(); });

  it('enforces unique name constraint', async () => {
    await db.insert(kaks).values({ id: crypto.randomUUID(), name: 'Pope' });
    await expect(
      db.insert(kaks).values({ id: crypto.randomUUID(), name: 'Pope' })
    ).rejects.toThrow();
  });

  it('allows many KAKs with distinct names', async () => {
    const names = ['Pope', 'Dump Bear', 'Dyer', 'Bopper'];
    await db.insert(kaks).values(names.map(name => ({ id: crypto.randomUUID(), name })));

    const rows = await db.select().from(kaks);
    expect(rows).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// kaks table — filtering by status
// ---------------------------------------------------------------------------

describe('kaks table — filtering by status', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
  });

  afterEach(() => { sqlite.close(); });

  it('filters active KAKs', async () => {
    await db.insert(kaks).values([
      { id: crypto.randomUUID(), name: 'Active1', status: 'active' },
      { id: crypto.randomUUID(), name: 'Active2', status: 'active' },
      { id: crypto.randomUUID(), name: 'Retired1', status: 'retired' },
      { id: crypto.randomUUID(), name: 'InMemoriam1', status: 'in-memoriam' },
    ]);

    const activeKaks = await db.select().from(kaks).where(eq(kaks.status, 'active'));
    expect(activeKaks).toHaveLength(2);
    expect(activeKaks.every(k => k.status === 'active')).toBe(true);
  });

  it('filters retired KAKs', async () => {
    await db.insert(kaks).values([
      { id: crypto.randomUUID(), name: 'A', status: 'active' },
      { id: crypto.randomUUID(), name: 'R', status: 'retired' },
    ]);

    const retired = await db.select().from(kaks).where(eq(kaks.status, 'retired'));
    expect(retired).toHaveLength(1);
    expect(retired[0].name).toBe('R');
  });

  it('returns empty list when no KAKs match status', async () => {
    await db.insert(kaks).values([{ id: crypto.randomUUID(), name: 'Active1', status: 'active' }]);

    const inMemoriam = await db.select().from(kaks).where(eq(kaks.status, 'in-memoriam'));
    expect(inMemoriam).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// teams FK columns (kak_1 … kak_4)
// ---------------------------------------------------------------------------

describe('teams — kak FK columns', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('team kak FK columns default to null', async () => {
    const rows = await db.select().from(teams).where(eq(teams.id, seedIds.teamId));
    expect(rows[0].kak1Id).toBeNull();
    expect(rows[0].kak2Id).toBeNull();
    expect(rows[0].kak3Id).toBeNull();
    expect(rows[0].kak4Id).toBeNull();
  });

  it('sets all four kak FK columns on a team', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;

    // Insert two more kaks for slots 3 and 4
    const kakId3 = crypto.randomUUID();
    const kakId4 = crypto.randomUUID();
    await db.insert(kaks).values([
      { id: kakId3, name: 'KAK Three' },
      { id: kakId4, name: 'KAK Four' },
    ]);

    const teamId = crypto.randomUUID();
    await db.insert(teams).values({
      id: teamId,
      yearId,
      name: 'FK Team',
      position: 3,
      kak1Id: kakId1,
      kak2Id: kakId2,
      kak3Id: kakId3,
      kak4Id: kakId4,
      locked: false,
    });

    const rows = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(rows[0].kak1Id).toBe(kakId1);
    expect(rows[0].kak2Id).toBe(kakId2);
    expect(rows[0].kak3Id).toBe(kakId3);
    expect(rows[0].kak4Id).toBe(kakId4);
  });

  it('updates kak FK columns independently', async () => {
    const { kakId1, kakId2, teamId } = seedIds;

    await db.update(teams).set({ kak1Id: kakId1, kak2Id: kakId2 }).where(eq(teams.id, teamId));

    const rows = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(rows[0].kak1Id).toBe(kakId1);
    expect(rows[0].kak2Id).toBe(kakId2);
    expect(rows[0].kak3Id).toBeNull();
    expect(rows[0].kak4Id).toBeNull();
  });

  it('legacy text columns still work alongside FK columns', async () => {
    const rows = await db.select().from(teams).where(eq(teams.id, seedIds.teamId));

    // Legacy text columns are populated from seed
    expect(rows[0].kak1).toBe('Player 1');
    expect(rows[0].kak2).toBe('Player 2');
    expect(rows[0].kak3).toBe('Player 3');
    expect(rows[0].kak4).toBe('Player 4');
    // FK columns are null until migrated
    expect(rows[0].kak1Id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// champs table
// ---------------------------------------------------------------------------

describe('champs table — CRUD', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('inserts a champ entry for a year and kak', async () => {
    const { yearId, kakId1 } = seedIds;
    const id = crypto.randomUUID();
    await db.insert(champs).values({ id, yearId, kakId: kakId1 });

    const rows = await db.select().from(champs).where(eq(champs.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].yearId).toBe(yearId);
    expect(rows[0].kakId).toBe(kakId1);
  });

  it('allows multiple kaks to be champs in the same year (different slots)', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;
    await db.insert(champs).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId, kakId: kakId2 },
    ]);

    const rows = await db.select().from(champs).where(eq(champs.yearId, yearId));
    expect(rows).toHaveLength(2);
  });

  it('enforces unique constraint — same year + kak cannot be inserted twice', async () => {
    const { yearId, kakId1 } = seedIds;
    await db.insert(champs).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 });

    await expect(
      db.insert(champs).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 })
    ).rejects.toThrow();
  });

  it('allows the same kak to be champ in different years', async () => {
    const { yearId, kakId1 } = seedIds;

    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);

    await db.insert(champs).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId: yearId2, kakId: kakId1 },
    ]);

    const rows = await db.select().from(champs).where(eq(champs.kakId, kakId1));
    expect(rows).toHaveLength(2);
  });

  it('deletes champs entries for a year (for idempotent recalculation)', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;
    await db.insert(champs).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId, kakId: kakId2 },
    ]);

    await db.delete(champs).where(eq(champs.yearId, yearId));

    const rows = await db.select().from(champs).where(eq(champs.yearId, yearId));
    expect(rows).toHaveLength(0);
  });

  it('deleting champs for one year does not affect another year', async () => {
    const { yearId, kakId1 } = seedIds;

    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);

    await db.insert(champs).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId: yearId2, kakId: kakId1 },
    ]);

    await db.delete(champs).where(eq(champs.yearId, yearId));

    expect(await db.select().from(champs).where(eq(champs.yearId, yearId))).toHaveLength(0);
    expect(await db.select().from(champs).where(eq(champs.yearId, yearId2))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// boots table
// ---------------------------------------------------------------------------

describe('boots table — CRUD', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('inserts a boot entry for a year and kak', async () => {
    const { yearId, kakId1 } = seedIds;
    const id = crypto.randomUUID();
    await db.insert(boots).values({ id, yearId, kakId: kakId1 });

    const rows = await db.select().from(boots).where(eq(boots.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].yearId).toBe(yearId);
    expect(rows[0].kakId).toBe(kakId1);
  });

  it('allows multiple kaks to get the boot in the same year (tied last)', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;
    await db.insert(boots).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId, kakId: kakId2 },
    ]);

    const rows = await db.select().from(boots).where(eq(boots.yearId, yearId));
    expect(rows).toHaveLength(2);
  });

  it('enforces unique constraint — same year + kak cannot be inserted twice', async () => {
    const { yearId, kakId1 } = seedIds;
    await db.insert(boots).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 });

    await expect(
      db.insert(boots).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 })
    ).rejects.toThrow();
  });

  it('allows the same kak to get the boot in different years', async () => {
    const { yearId, kakId1 } = seedIds;

    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);

    await db.insert(boots).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId: yearId2, kakId: kakId1 },
    ]);

    const rows = await db.select().from(boots).where(eq(boots.kakId, kakId1));
    expect(rows).toHaveLength(2);
  });

  it('deletes boot entries for a year (for idempotent recalculation)', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;
    await db.insert(boots).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId, kakId: kakId2 },
    ]);

    await db.delete(boots).where(eq(boots.yearId, yearId));

    const rows = await db.select().from(boots).where(eq(boots.yearId, yearId));
    expect(rows).toHaveLength(0);
  });

  it('deleting boots for one year does not affect another year', async () => {
    const { yearId, kakId1 } = seedIds;

    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);

    await db.insert(boots).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId: yearId2, kakId: kakId1 },
    ]);

    await db.delete(boots).where(eq(boots.yearId, yearId));

    expect(await db.select().from(boots).where(eq(boots.yearId, yearId))).toHaveLength(0);
    expect(await db.select().from(boots).where(eq(boots.yearId, yearId2))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// champs + boots isolation from each other
// ---------------------------------------------------------------------------

describe('champs and boots are independent tables', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('a kak can be in champs and boots in different years', async () => {
    const { yearId, kakId1 } = seedIds;

    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);

    await db.insert(champs).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 });
    await db.insert(boots).values({ id: crypto.randomUUID(), yearId: yearId2, kakId: kakId1 });

    const champRows = await db.select().from(champs).where(eq(champs.kakId, kakId1));
    const bootRows = await db.select().from(boots).where(eq(boots.kakId, kakId1));

    expect(champRows).toHaveLength(1);
    expect(bootRows).toHaveLength(1);
  });

  it('clearing champs does not affect boots', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;

    await db.insert(champs).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 });
    await db.insert(boots).values({ id: crypto.randomUUID(), yearId, kakId: kakId2 });

    await db.delete(champs).where(eq(champs.yearId, yearId));

    expect(await db.select().from(champs).where(eq(champs.yearId, yearId))).toHaveLength(0);
    expect(await db.select().from(boots).where(eq(boots.yearId, yearId))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Stats — aggregate queries (count per kak)
// ---------------------------------------------------------------------------

describe('kak stats — count queries', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let seedIds: ReturnType<typeof seedTestDatabase>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
    seedIds = seedTestDatabase(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('counts champ appearances per kak across multiple years', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;

    const yearId2 = crypto.randomUUID();
    const yearId3 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId3, 2027, 'Test Year 2027', 'upcoming', 0);

    // kakId1 wins 2 years, kakId2 wins 1 year
    await db.insert(champs).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId: yearId2, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId: yearId3, kakId: kakId2 },
    ]);

    const results = await db
      .select({ kakId: champs.kakId, total: count() })
      .from(champs)
      .groupBy(champs.kakId);

    const kak1Count = results.find(r => r.kakId === kakId1)?.total ?? 0;
    const kak2Count = results.find(r => r.kakId === kakId2)?.total ?? 0;

    expect(kak1Count).toBe(2);
    expect(kak2Count).toBe(1);
  });

  it('counts boot appearances per kak across multiple years', async () => {
    const { yearId, kakId1, kakId2 } = seedIds;

    const yearId2 = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO years (id, year, name, status, fishing_locked) VALUES (?, ?, ?, ?, ?)`)
      .run(yearId2, 2026, 'Test Year 2026', 'upcoming', 0);

    // kakId2 gets the boot twice, kakId1 once
    await db.insert(boots).values([
      { id: crypto.randomUUID(), yearId, kakId: kakId1 },
      { id: crypto.randomUUID(), yearId, kakId: kakId2 },
      { id: crypto.randomUUID(), yearId: yearId2, kakId: kakId2 },
    ]);

    const results = await db
      .select({ kakId: boots.kakId, total: count() })
      .from(boots)
      .groupBy(boots.kakId);

    const kak1Count = results.find(r => r.kakId === kakId1)?.total ?? 0;
    const kak2Count = results.find(r => r.kakId === kakId2)?.total ?? 0;

    expect(kak1Count).toBe(1);
    expect(kak2Count).toBe(2);
  });

  it('kak with no champs entry does not appear in champ count query', async () => {
    const { kakId1, kakId2, yearId } = seedIds;

    // Only kakId1 gets a champ entry
    await db.insert(champs).values({ id: crypto.randomUUID(), yearId, kakId: kakId1 });

    const results = await db
      .select({ kakId: champs.kakId, total: count() })
      .from(champs)
      .groupBy(champs.kakId);

    const kakId2Entry = results.find(r => r.kakId === kakId2);
    expect(kakId2Entry).toBeUndefined();
  });

  it('kak with no boots entry does not appear in boot count query', async () => {
    const { kakId1, kakId2, yearId } = seedIds;

    // Only kakId2 gets a boot entry
    await db.insert(boots).values({ id: crypto.randomUUID(), yearId, kakId: kakId2 });

    const results = await db
      .select({ kakId: boots.kakId, total: count() })
      .from(boots)
      .groupBy(boots.kakId);

    const kakId1Entry = results.find(r => r.kakId === kakId1);
    expect(kakId1Entry).toBeUndefined();
  });

  it('returns zero counts when no champs or boots exist', async () => {
    const champResults = await db
      .select({ kakId: champs.kakId, total: count() })
      .from(champs)
      .groupBy(champs.kakId);

    const bootResults = await db
      .select({ kakId: boots.kakId, total: count() })
      .from(boots)
      .groupBy(boots.kakId);

    expect(champResults).toHaveLength(0);
    expect(bootResults).toHaveLength(0);
  });
});
