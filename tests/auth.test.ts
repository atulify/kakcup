import { describe, it, expect } from 'vitest';
import { verifyPassword } from '../server/password.js';

const SHARED_PASSWORD = 'password';
const SHARED_HASH = '$2b$10$hPOyTYjORgU4YCfIoJ.MHusVZ1DPfV8MDu26qWgD6HMeOMOd6XNrK';


describe('Password Verification', () => {
  it('should verify correct password', async () => {
    expect(await verifyPassword(SHARED_PASSWORD, SHARED_HASH)).toBe(true);
  });

  it('should reject incorrect password', async () => {
    expect(await verifyPassword('wrongpassword', SHARED_HASH)).toBe(false);
  });

  it('should reject empty password when hash is for non-empty', async () => {
    expect(await verifyPassword('', SHARED_HASH)).toBe(false);
  });

  it('should treat passwords as case-sensitive', async () => {
    expect(await verifyPassword('Password', SHARED_HASH)).toBe(false);
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
