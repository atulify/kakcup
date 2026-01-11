import { beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';

// Helper function to clean up all test-*.db files
function cleanupTestDatabases() {
  const projectRoot = path.resolve(__dirname, '..');
  const files = readdirSync(projectRoot);
  
  files.forEach((file) => {
    if (file.startsWith('test-') && file.endsWith('.db')) {
      const filePath = path.resolve(projectRoot, file);
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch (error) {
        // Ignore errors if file is locked or doesn't exist
        // This can happen if a test is still using the database
      }
    }
  });

  // Also clean up the fixed test.db file
  const testDbPath = path.resolve(__dirname, '../test.db');
  if (existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath);
    } catch (error) {
      // Ignore errors if file is locked
    }
  }
}

// Clean up test databases before and after each test
beforeEach(() => {
  cleanupTestDatabases();
});

afterEach(() => {
  cleanupTestDatabases();

  // Reset environment variables
  delete process.env.DATABASE_URL;
});
