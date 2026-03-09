import { fileURLToPath } from "url";
import { db as defaultDb } from "./db.js";
import { kaks, teams, years } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Source data — KAK Cup 2025 roster
// ---------------------------------------------------------------------------

export const KAK_2025_NAMES = [
  'Pope', 'Dump Bear', 'Dyer', 'Bopper',
  'Nych', 'Colster', 'Norton', 'Booya',
  'Body', 'Boxy', 'Tank', 'Muldoon',
  'Murray', 'Sewter', 'Burnie', 'Newt',
  'Stubby', 'Pete', 'No Show', 'Mckay',
  'Hooper', 'Burns', 'Jocquo', 'Fatty',
  'TBone', 'Sub', 'Dano', 'Morash',
] as const;

// Maps team name → [kak1, kak2, kak3, kak4] for the 2025 year
export const TEAM_2025_MEMBERS: Record<string, [string, string, string, string]> = {
  'Champs': ['Pope', 'Dump Bear', 'Dyer', 'Bopper'],
  'Team 1': ['Nych', 'Colster', 'Norton', 'Booya'],
  'Team 2': ['Body', 'Boxy', 'Tank', 'Muldoon'],
  'Team 3': ['Murray', 'Sewter', 'Burnie', 'Newt'],
  'Team 4': ['Stubby', 'Pete', 'No Show', 'Mckay'],
  'Team 5': ['Hooper', 'Burns', 'Jocquo', 'Fatty'],
  'Team 6': ['TBone', 'Sub', 'Dano', 'Morash'],
};

// Historical KAKs who no longer appear in the active 2025 roster
export const HISTORICAL_KAKS: { name: string; status: 'retired' | 'in-memoriam' }[] = [
  { name: 'Draper',          status: 'in-memoriam' },
  { name: 'Nate',            status: 'retired' },
  { name: 'Needham',         status: 'retired' },
  { name: 'Murray Kightly',  status: 'retired' },
  { name: 'Snake',           status: 'retired' },
  { name: 'Chateauvert',     status: 'retired' },
  { name: 'Dave Draper',     status: 'retired' },
  { name: 'Kittner',         status: 'retired' },
];

// ---------------------------------------------------------------------------
// Exported functions (accept a db instance so they can be unit-tested)
// ---------------------------------------------------------------------------

/**
 * Inserts all 28 KAK Cup 2025 players into the kaks table.
 * Idempotent: uses onConflictDoNothing so it is safe to run multiple times.
 * Returns the full kaks list after insertion.
 */
export async function insertKaks(dbInstance: typeof defaultDb): Promise<typeof kaks.$inferSelect[]> {
  const active = KAK_2025_NAMES.map(name => ({ name, status: 'active' as const }));
  const historical = HISTORICAL_KAKS.map(({ name, status }) => ({ name, status }));

  await dbInstance
    .insert(kaks)
    .values([...active, ...historical])
    .onConflictDoNothing();

  return dbInstance.select().from(kaks);
}

/**
 * Backfills kak_1..kak_4 FK columns on the 7 KAK Cup 2025 teams.
 * Looks up each KAK by name to get its UUID, then updates the team row.
 * Only updates teams whose FK columns are still null (safe to re-run).
 * Returns the number of teams successfully updated.
 */
export async function backfill2025Teams(dbInstance: typeof defaultDb): Promise<number> {
  const [year2025] = await dbInstance
    .select()
    .from(years)
    .where(eq(years.year, 2025));

  if (!year2025) {
    console.log('No 2025 year found in database — skipping team backfill.');
    return 0;
  }

  // Build name → id lookup map
  const allKaks = await dbInstance.select().from(kaks);
  const kakByName = new Map(allKaks.map((k: { name: string; id: string }) => [k.name, k.id]));

  let updated = 0;

  for (const [teamName, [m1, m2, m3, m4]] of Object.entries(TEAM_2025_MEMBERS)) {
    const kak1Id = kakByName.get(m1);
    const kak2Id = kakByName.get(m2);
    const kak3Id = kakByName.get(m3);
    const kak4Id = kakByName.get(m4);

    if (!kak1Id || !kak2Id || !kak3Id || !kak4Id) {
      console.warn(`  ⚠ Could not resolve all KAK IDs for team "${teamName}" — skipping.`);
      continue;
    }

    await dbInstance
      .update(teams)
      .set({ kak1Id, kak2Id, kak3Id, kak4Id })
      .where(and(
        eq(teams.yearId, year2025.id),
        eq(teams.name, teamName),
      ));

    console.log(`  ✓ ${teamName}: ${m1}, ${m2}, ${m3}, ${m4}`);
    updated++;
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function run() {
  console.log('Seeding KAKs...');
  const allKaks = await insertKaks(defaultDb);
  console.log(`  ✓ ${allKaks.length} KAKs present in database.`);

  console.log('\nBackfilling 2025 team FK columns...');
  const teamsUpdated = await backfill2025Teams(defaultDb);
  console.log(`  ✓ ${teamsUpdated} teams updated.`);

  console.log('\nDone.');
}

// Only self-execute when run directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
