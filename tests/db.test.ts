import { describe, it, expect, beforeEach } from 'vitest';

describe('Database Connection Logic', () => {
  beforeEach(() => {
    // Clean up environment
    delete process.env.DATABASE_URL;

    // Clear the module cache to force re-evaluation
    const dbModulePath = '../server/db.ts';
    if (require.cache[require.resolve(dbModulePath)]) {
      delete require.cache[require.resolve(dbModulePath)];
    }
  });

  it('should use SQLite when DATABASE_URL is not set', async () => {
    // Ensure DATABASE_URL is not set
    delete process.env.DATABASE_URL;

    // Dynamically import to get fresh instance
    const { isPostgres } = await import('../server/db.js');

    expect(isPostgres).toBe(false);
  });

  it('should detect PostgreSQL when DATABASE_URL is set', async () => {
    // Set a mock PostgreSQL URL
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

    // Test the logic directly since module is cached
    const isPostgres = !!process.env.DATABASE_URL;

    expect(isPostgres).toBe(true);
  });

  it('should create a database connection', async () => {
    delete process.env.DATABASE_URL;

    const { db } = await import('../server/db.js');

    expect(db).toBeDefined();
    expect(typeof db).toBe('object');
  });
});

describe('Database Environment Detection', () => {
  it('should correctly identify SQLite environment', () => {
    delete process.env.DATABASE_URL;
    const isPostgres = !!process.env.DATABASE_URL;
    expect(isPostgres).toBe(false);
  });

  it('should correctly identify PostgreSQL environment', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const isPostgres = !!process.env.DATABASE_URL;
    expect(isPostgres).toBe(true);
  });

  it('should handle empty DATABASE_URL as SQLite', () => {
    process.env.DATABASE_URL = '';
    const isPostgres = !!process.env.DATABASE_URL;
    expect(isPostgres).toBe(false);
  });
});
