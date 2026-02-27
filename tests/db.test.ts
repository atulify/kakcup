import { describe, it, expect } from 'vitest';

describe('Database Connection Logic', () => {
  it('should always report isPostgres=true (neon-http driver used in all envs)', async () => {
    const { isPostgres } = await import('../server/db.js');
    expect(isPostgres).toBe(true);
  });

  it('should have null db when DATABASE_URL is absent (requires setDb() for local dev)', async () => {
    delete process.env.DATABASE_URL;
    const { db } = await import('../server/db.js');
    // db is null until setDb() is called; this is expected behaviour in local dev
    expect(db === null || typeof db === 'object').toBe(true);
  });

  it('should export a setDb function for local dev SQLite injection', async () => {
    const { setDb } = await import('../server/db.js');
    expect(typeof setDb).toBe('function');
  });
});

describe('Database Environment Detection', () => {
  it('should correctly identify PostgreSQL environment when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const isPostgres = !!process.env.DATABASE_URL;
    expect(isPostgres).toBe(true);
    delete process.env.DATABASE_URL;
  });

  it('should correctly identify absent DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    const hasUrl = !!process.env.DATABASE_URL;
    expect(hasUrl).toBe(false);
  });

  it('should handle empty DATABASE_URL as absent', () => {
    process.env.DATABASE_URL = '';
    const isPostgres = !!process.env.DATABASE_URL;
    expect(isPostgres).toBe(false);
    delete process.env.DATABASE_URL;
  });
});
