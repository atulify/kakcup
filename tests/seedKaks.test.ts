import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { createTestDatabase } from './helpers.js';
import { kaks, teams, years } from '../shared/schema-sqlite.js';
import {
  KAK_2025_NAMES,
  TEAM_2025_MEMBERS,
  insertKaks,
  backfill2025Teams,
} from '../server/seedKaks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const YEAR_2025_ID = 'eeeeeeee-0000-0000-0000-000000002025';

/** Seeds a full 2025 year + 7 teams matching production data. */
function seed2025(sqlite: Database.Database) {
  sqlite.prepare(
    `INSERT INTO years (id, year, name, status, fishing_locked, chug_locked, golf_locked)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(YEAR_2025_ID, 2025, 'KAK Cup 2025', 'completed', 1, 1, 1);

  const teamRows = [
    ['Champs',  1],
    ['Team 1',  2],
    ['Team 2',  3],
    ['Team 3',  4],
    ['Team 4',  5],
    ['Team 5',  6],
    ['Team 6',  7],
  ] as const;

  for (const [name, position] of teamRows) {
    const [m1, m2, m3, m4] = TEAM_2025_MEMBERS[name];
    sqlite.prepare(
      `INSERT INTO teams (id, year_id, name, position, kak1, kak2, kak3, kak4, locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(crypto.randomUUID(), YEAR_2025_ID, name, position, m1, m2, m3, m4);
  }
}

function setup() {
  const { sqlite } = createTestDatabase();
  const db = drizzle(sqlite, { schema: { kaks, teams, years } });
  return { sqlite, db };
}

// ---------------------------------------------------------------------------
// KAK_2025_NAMES — source data integrity
// ---------------------------------------------------------------------------

describe('KAK_2025_NAMES — source data', () => {
  it('contains exactly 28 names', () => {
    expect(KAK_2025_NAMES).toHaveLength(28);
  });

  it('has no duplicate names', () => {
    const unique = new Set(KAK_2025_NAMES);
    expect(unique.size).toBe(KAK_2025_NAMES.length);
  });

  it('covers every member listed in TEAM_2025_MEMBERS', () => {
    const nameSet = new Set(KAK_2025_NAMES);
    for (const [team, members] of Object.entries(TEAM_2025_MEMBERS)) {
      for (const member of members) {
        expect(nameSet.has(member), `"${member}" (${team}) missing from KAK_2025_NAMES`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TEAM_2025_MEMBERS — source data integrity
// ---------------------------------------------------------------------------

describe('TEAM_2025_MEMBERS — source data', () => {
  it('contains exactly 7 teams', () => {
    expect(Object.keys(TEAM_2025_MEMBERS)).toHaveLength(7);
  });

  it('each team has exactly 4 members', () => {
    for (const [team, members] of Object.entries(TEAM_2025_MEMBERS)) {
      expect(members, `${team} should have 4 members`).toHaveLength(4);
    }
  });

  it('no member appears on more than one team', () => {
    const seen = new Map<string, string>();
    for (const [team, members] of Object.entries(TEAM_2025_MEMBERS)) {
      for (const member of members) {
        expect(seen.has(member), `"${member}" appears on both ${seen.get(member)} and ${team}`).toBe(false);
        seen.set(member, team);
      }
    }
  });

  it('all 7 expected team names are present', () => {
    const names = Object.keys(TEAM_2025_MEMBERS);
    expect(names).toContain('Champs');
    expect(names).toContain('Team 1');
    expect(names).toContain('Team 2');
    expect(names).toContain('Team 3');
    expect(names).toContain('Team 4');
    expect(names).toContain('Team 5');
    expect(names).toContain('Team 6');
  });
});

// ---------------------------------------------------------------------------
// insertKaks
// ---------------------------------------------------------------------------

describe('insertKaks', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
  });

  afterEach(() => { sqlite.close(); });

  it('inserts all 28 KAKs', async () => {
    await insertKaks(db as any);

    const rows = await db.select().from(kaks);
    expect(rows).toHaveLength(28);
  });

  it('all inserted KAKs have status active', async () => {
    await insertKaks(db as any);

    const rows = await db.select().from(kaks);
    expect(rows.every(k => k.status === 'active')).toBe(true);
  });

  it('all KAK_2025_NAMES are present after insert', async () => {
    await insertKaks(db as any);

    const rows = await db.select().from(kaks);
    const names = new Set(rows.map(k => k.name));
    for (const name of KAK_2025_NAMES) {
      expect(names.has(name), `"${name}" not found in kaks table`).toBe(true);
    }
  });

  it('is idempotent — running twice does not throw or duplicate rows', async () => {
    await insertKaks(db as any);
    await expect(insertKaks(db as any)).resolves.not.toThrow();

    const rows = await db.select().from(kaks);
    expect(rows).toHaveLength(28);
  });

  it('returns the full kaks list', async () => {
    const result = await insertKaks(db as any);
    expect(result).toHaveLength(28);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('status');
  });

  it('does not overwrite existing KAKs with different status', async () => {
    // Pre-insert Pope as retired
    await db.insert(kaks).values({ id: crypto.randomUUID(), name: 'Pope', status: 'retired' });

    await insertKaks(db as any);

    const [pope] = await db.select().from(kaks).where(eq(kaks.name, 'Pope'));
    // onConflictDoNothing means Pope stays retired, not overwritten to active
    expect(pope.status).toBe('retired');
    // Total count: 28 (Pope already existed, 27 new ones inserted)
    const all = await db.select().from(kaks);
    expect(all).toHaveLength(28);
  });
});

// ---------------------------------------------------------------------------
// backfill2025Teams
// ---------------------------------------------------------------------------

describe('backfill2025Teams', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    ({ sqlite, db } = setup());
    seed2025(sqlite);
  });

  afterEach(() => { sqlite.close(); });

  it('returns 0 when no 2025 year exists in the database', async () => {
    const { sqlite: s2, db: db2 } = setup();
    try {
      const count = await backfill2025Teams(db2 as any);
      expect(count).toBe(0);
    } finally {
      s2.close();
    }
  });

  it('returns 0 and skips gracefully when kaks table is empty', async () => {
    // 2025 year exists (seeded) but no kaks inserted yet
    const count = await backfill2025Teams(db as any);
    expect(count).toBe(0);
  });

  it('updates all 7 teams after kaks are inserted', async () => {
    await insertKaks(db as any);
    const count = await backfill2025Teams(db as any);
    expect(count).toBe(7);
  });

  it('sets correct kak1Id for every team', async () => {
    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    const allKaks = await db.select().from(kaks);
    const kakByName = new Map(allKaks.map(k => [k.name, k.id]));

    const teamRows = await db.select().from(teams).where(eq(teams.yearId, YEAR_2025_ID));

    for (const team of teamRows) {
      const [expectedM1] = TEAM_2025_MEMBERS[team.name] ?? [];
      if (!expectedM1) continue;
      expect(team.kak1Id).toBe(kakByName.get(expectedM1));
    }
  });

  it('sets all four kak FK columns correctly for each team', async () => {
    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    const allKaks = await db.select().from(kaks);
    const kakByName = new Map(allKaks.map(k => [k.name, k.id]));

    const teamRows = await db.select().from(teams).where(eq(teams.yearId, YEAR_2025_ID));

    for (const team of teamRows) {
      const members = TEAM_2025_MEMBERS[team.name];
      if (!members) continue;
      const [m1, m2, m3, m4] = members;
      expect(team.kak1Id, `${team.name} kak1Id`).toBe(kakByName.get(m1));
      expect(team.kak2Id, `${team.name} kak2Id`).toBe(kakByName.get(m2));
      expect(team.kak3Id, `${team.name} kak3Id`).toBe(kakByName.get(m3));
      expect(team.kak4Id, `${team.name} kak4Id`).toBe(kakByName.get(m4));
    }
  });

  it('Champs team maps to Pope, Dump Bear, Dyer, Bopper', async () => {
    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    const allKaks = await db.select().from(kaks);
    const kakByName = new Map(allKaks.map(k => [k.name, k.id]));

    const [champs] = await db.select().from(teams).where(
      and(eq(teams.yearId, YEAR_2025_ID), eq(teams.name, 'Champs'))
    );

    expect(champs.kak1Id).toBe(kakByName.get('Pope'));
    expect(champs.kak2Id).toBe(kakByName.get('Dump Bear'));
    expect(champs.kak3Id).toBe(kakByName.get('Dyer'));
    expect(champs.kak4Id).toBe(kakByName.get('Bopper'));
  });

  it('no team FK column is null after a successful backfill', async () => {
    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    const teamRows = await db.select().from(teams).where(eq(teams.yearId, YEAR_2025_ID));
    for (const team of teamRows) {
      expect(team.kak1Id, `${team.name} kak1Id should not be null`).not.toBeNull();
      expect(team.kak2Id, `${team.name} kak2Id should not be null`).not.toBeNull();
      expect(team.kak3Id, `${team.name} kak3Id should not be null`).not.toBeNull();
      expect(team.kak4Id, `${team.name} kak4Id should not be null`).not.toBeNull();
    }
  });

  it('legacy text columns are preserved after backfill', async () => {
    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    const [champs] = await db.select().from(teams).where(
      and(eq(teams.yearId, YEAR_2025_ID), eq(teams.name, 'Champs'))
    );

    // Legacy text fields come from the original team creation
    expect(champs.kak1).toBe('Pope');
    expect(champs.kak2).toBe('Dump Bear');
    expect(champs.kak3).toBe('Dyer');
    expect(champs.kak4).toBe('Bopper');
  });

  it('is idempotent — running backfill twice produces the same result', async () => {
    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    // Capture IDs after first run
    const firstRun = await db.select().from(teams).where(eq(teams.yearId, YEAR_2025_ID));

    // Second run
    await backfill2025Teams(db as any);
    const secondRun = await db.select().from(teams).where(eq(teams.yearId, YEAR_2025_ID));

    for (let i = 0; i < firstRun.length; i++) {
      expect(secondRun[i].kak1Id).toBe(firstRun[i].kak1Id);
      expect(secondRun[i].kak2Id).toBe(firstRun[i].kak2Id);
      expect(secondRun[i].kak3Id).toBe(firstRun[i].kak3Id);
      expect(secondRun[i].kak4Id).toBe(firstRun[i].kak4Id);
    }
  });

  it('does not touch teams from other years', async () => {
    // Insert a second year with a team that has the same name
    const year2026Id = crypto.randomUUID();
    sqlite.prepare(
      `INSERT INTO years (id, year, name, status, fishing_locked, chug_locked, golf_locked)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(year2026Id, 2026, 'KAK Cup 2026', 'upcoming', 0, 0, 0);
    sqlite.prepare(
      `INSERT INTO teams (id, year_id, name, position, locked) VALUES (?, ?, ?, ?, 0)`
    ).run(crypto.randomUUID(), year2026Id, 'Champs', 1);

    await insertKaks(db as any);
    await backfill2025Teams(db as any);

    const [team2026] = await db.select().from(teams).where(
      and(eq(teams.yearId, year2026Id), eq(teams.name, 'Champs'))
    );
    // 2026 Champs should NOT have been touched
    expect(team2026.kak1Id).toBeNull();
    expect(team2026.kak2Id).toBeNull();
  });
});
