import { beforeEach, afterEach } from 'vitest';

// Clean up environment variables before and after each test
beforeEach(() => {
  // No database cleanup needed - using in-memory databases for tests
});

afterEach(() => {
  // Reset environment variables
  delete process.env.DATABASE_URL;
});
