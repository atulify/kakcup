import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '../server/auth.js';

describe('Password Hashing', () => {
  it('should hash a password', async () => {
    const password = 'testpassword123';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  it('should generate different hashes for the same password', async () => {
    const password = 'testpassword123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2); // Due to salt
  });

  it('should handle empty passwords', async () => {
    const password = '';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('should handle long passwords', async () => {
    const password = 'a'.repeat(100);
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('Password Verification', () => {
  it('should verify correct password', async () => {
    const password = 'testpassword123';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'testpassword123';
    const wrongPassword = 'wrongpassword';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(wrongPassword, hash);

    expect(isValid).toBe(false);
  });

  it('should reject empty password when hash is for non-empty', async () => {
    const password = 'testpassword123';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword('', hash);

    expect(isValid).toBe(false);
  });

  it('should handle case-sensitive passwords', async () => {
    const password = 'TestPassword123';
    const hash = await hashPassword(password);
    const isValidCorrect = await verifyPassword('TestPassword123', hash);
    const isValidWrong = await verifyPassword('testpassword123', hash);

    expect(isValidCorrect).toBe(true);
    expect(isValidWrong).toBe(false);
  });

  it('should reject invalid hash format', async () => {
    const password = 'testpassword123';
    const invalidHash = 'not-a-valid-hash';

    // bcrypt returns false for invalid hashes instead of throwing
    const result = await verifyPassword(password, invalidHash);
    expect(result).toBe(false);
  });
});

describe('Authentication Middleware', () => {
  it('should export isAuthenticated middleware', async () => {
    const { isAuthenticated } = await import('../server/auth.js');
    expect(isAuthenticated).toBeDefined();
    expect(typeof isAuthenticated).toBe('function');
  });

  it('should export isAdmin middleware', async () => {
    const { isAdmin } = await import('../server/auth.js');
    expect(isAdmin).toBeDefined();
    expect(typeof isAdmin).toBe('function');
  });
});

describe('Password Security', () => {
  it('should use sufficient hash rounds (cost factor)', async () => {
    const password = 'testpassword123';
    const startTime = Date.now();
    const hash = await hashPassword(password);
    const endTime = Date.now();

    // bcrypt with 12 rounds should take at least 50ms
    // This ensures we're using a sufficient cost factor
    const duration = endTime - startTime;
    expect(duration).toBeGreaterThan(50);
    expect(hash).toMatch(/^\$2[aby]\$12\$/); // Verify cost factor of 12
  });

  it('should produce hashes of consistent length', async () => {
    const passwords = ['short', 'mediumlength', 'verylongpasswordthatgoeson'];
    const hashes = await Promise.all(passwords.map(p => hashPassword(p)));

    // All bcrypt hashes should be 60 characters
    hashes.forEach(hash => {
      expect(hash.length).toBe(60);
    });
  });
});
