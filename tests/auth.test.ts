import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword, verifyPassword } from '../server/password.js';

// Pre-compute a single hash to share across verification tests (~300ms saved)
let sharedHash: string;
const SHARED_PASSWORD = 'testpassword123';

beforeAll(async () => {
  sharedHash = await hashPassword(SHARED_PASSWORD);
});

describe('Password Hashing', () => {
  it('should hash a password', () => {
    expect(sharedHash).toBeDefined();
    expect(sharedHash).not.toBe(SHARED_PASSWORD);
    expect(sharedHash.length).toBeGreaterThan(0);
    expect(sharedHash).toMatch(/^\$2[aby]\$/);
  });

  it('should generate different hashes for the same password', async () => {
    const hash2 = await hashPassword(SHARED_PASSWORD);
    expect(sharedHash).not.toBe(hash2); // Due to salt
  });

  it('should handle empty passwords', async () => {
    const hash = await hashPassword('');
    expect(hash).toBeDefined();
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('should handle long passwords', async () => {
    const hash = await hashPassword('a'.repeat(100));
    expect(hash).toBeDefined();
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('Password Verification', () => {
  it('should verify correct password', async () => {
    expect(await verifyPassword(SHARED_PASSWORD, sharedHash)).toBe(true);
  });

  it('should reject incorrect password', async () => {
    expect(await verifyPassword('wrongpassword', sharedHash)).toBe(false);
  });

  it('should reject empty password when hash is for non-empty', async () => {
    expect(await verifyPassword('', sharedHash)).toBe(false);
  });

  it('should handle case-sensitive passwords', async () => {
    const hash = await hashPassword('TestPassword123');
    expect(await verifyPassword('TestPassword123', hash)).toBe(true);
    expect(await verifyPassword('testpassword123', hash)).toBe(false);
  });

  it('should reject invalid hash format', async () => {
    expect(await verifyPassword(SHARED_PASSWORD, 'not-a-valid-hash')).toBe(false);
  });
});

describe('Authentication Middleware', () => {
  it('should export isAuthenticated middleware', async () => {
    const { isAuthenticated } = await import('../server/auth.js');
    expect(typeof isAuthenticated).toBe('function');
  });

  it('should export isAdmin middleware', async () => {
    const { isAdmin } = await import('../server/auth.js');
    expect(typeof isAdmin).toBe('function');
  });
});

describe('Password Security', () => {
  it('should use sufficient hash rounds (cost factor)', () => {
    // Verify cost factor of 10 from the shared hash
    expect(sharedHash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('should produce hashes of consistent length', async () => {
    const hashes = await Promise.all(['short', 'mediumlength', 'verylongpassword'].map(p => hashPassword(p)));
    hashes.forEach(hash => expect(hash.length).toBe(60));
  });
});
