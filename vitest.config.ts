import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    singleThread: true,
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
});
