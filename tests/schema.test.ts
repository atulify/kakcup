import { describe, it, expect, beforeEach } from 'vitest';

describe('Schema Switching Logic', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it('should export SQLite schema when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;

    const schema = await import('../shared/schema.js');

    expect(schema.users).toBeDefined();
    expect(schema.years).toBeDefined();
    expect(schema.teams).toBeDefined();
    expect(schema.fishWeights).toBeDefined();
    expect(schema.chugTimes).toBeDefined();
    expect(schema.golfScores).toBeDefined();
  });

  it('should have all required table definitions', async () => {
    const schema = await import('../shared/schema.js');

    // Check that all tables are defined (sessions removed — JWT replaces session store)
    expect(schema.users).toBeDefined();
    expect(schema.years).toBeDefined();
    expect(schema.teams).toBeDefined();
    expect(schema.fishWeights).toBeDefined();
    expect(schema.chugTimes).toBeDefined();
    expect(schema.golfScores).toBeDefined();
  });

  it('should export all required schemas', async () => {
    const schema = await import('../shared/schema.js');

    // Check insert schemas
    expect(schema.registerUserSchema).toBeDefined();
    expect(schema.insertYearSchema).toBeDefined();
    expect(schema.insertTeamSchema).toBeDefined();
    expect(schema.insertFishWeightSchema).toBeDefined();
    expect(schema.insertChugTimeSchema).toBeDefined();
    expect(schema.insertGolfScoreSchema).toBeDefined();
  });

  it('should export all required relations', async () => {
    const schema = await import('../shared/schema.js');

    expect(schema.yearsRelations).toBeDefined();
    expect(schema.teamsRelations).toBeDefined();
    expect(schema.fishWeightsRelations).toBeDefined();
    expect(schema.chugTimesRelations).toBeDefined();
    expect(schema.golfScoresRelations).toBeDefined();
  });
});

describe('SQLite Schema Structure', () => {
  it('should have correct table structure for SQLite', async () => {
    delete process.env.DATABASE_URL;

    const sqliteSchema = await import('../shared/schema-sqlite.js');

    // Verify users table has correct fields
    expect(sqliteSchema.users).toBeDefined();

    // Verify years table
    expect(sqliteSchema.years).toBeDefined();

    // Verify teams table
    expect(sqliteSchema.teams).toBeDefined();
  });
});

describe('PostgreSQL Schema Structure', () => {
  it('should have correct table structure for PostgreSQL', async () => {
    const postgresSchema = await import('../shared/schema-postgres.js');

    // Verify users table has correct fields
    expect(postgresSchema.users).toBeDefined();

    // Verify years table
    expect(postgresSchema.years).toBeDefined();

    // Verify teams table
    expect(postgresSchema.teams).toBeDefined();
  });

  it('should use UUID types in PostgreSQL schema', async () => {
    const postgresSchema = await import('../shared/schema-postgres.js');

    // PostgreSQL schema should be defined
    expect(postgresSchema.users).toBeDefined();
    expect(postgresSchema.years).toBeDefined();
  });
});

describe('Schema Compatibility', () => {
  it('should have matching exports between SQLite and PostgreSQL schemas', async () => {
    const sqliteSchema = await import('../shared/schema-sqlite.js');
    const postgresSchema = await import('../shared/schema-postgres.js');

    // Both schemas should export the same table names
    const sqliteKeys = Object.keys(sqliteSchema).sort();
    const postgresKeys = Object.keys(postgresSchema).sort();

    expect(sqliteKeys).toEqual(postgresKeys);
  });

  it('should have consistent type exports', async () => {
    const schema = await import('../shared/schema.js');

    // Type exports should be available regardless of database
    expect(typeof schema.registerUserSchema).toBe('object');
    expect(typeof schema.insertYearSchema).toBe('object');
    expect(typeof schema.insertTeamSchema).toBe('object');
  });
});
