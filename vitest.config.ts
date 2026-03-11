import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'client/**',
        '**/*.config.ts',
        'tests/**',
      ],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      // Tests run against SQLite — remap the production Postgres schema to SQLite
      '../shared/schema.js': path.resolve(__dirname, './shared/schema-sqlite.ts'),
    },
  },
});
