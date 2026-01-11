# Test Suite Documentation

## Overview

Comprehensive test suite for the KAK Cup application covering database functionality, authentication, storage layer, and API endpoints.

## Test Framework

- **Vitest** - Fast unit testing framework with Jest-compatible API
- **Supertest** - HTTP integration testing
- **Better-SQLite3** - In-memory/file-based database for testing

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### 1. Database Connection Tests (`db.test.ts`)
Tests the multi-database connection logic:
- ✅ SQLite selection when `DATABASE_URL` is not set
- ✅ PostgreSQL detection when `DATABASE_URL` is set
- ✅ Database connection creation
- ✅ Environment variable detection logic

### 2. Schema Switching Tests (`schema.test.ts`)
Tests dynamic schema loading based on environment:
- ✅ SQLite schema exports
- ✅ PostgreSQL schema structure
- ✅ Schema compatibility between databases
- ✅ All table definitions present
- ✅ Relations and insert schemas exported correctly

### 3. Authentication Tests (`auth.test.ts`)
Tests password hashing and verification:
- ✅ Password hashing with bcrypt
- ✅ Salt generation (different hashes for same password)
- ✅ Password verification (correct/incorrect)
- ✅ Case sensitivity handling
- ✅ Invalid hash format handling
- ✅ Security (12 rounds cost factor, consistent hash length)
- ✅ Middleware exports (isAuthenticated, isAdmin)

### 4. Storage Layer Tests (`storage.test.ts`)
Tests CRUD operations on all entities:
- ✅ User operations (create, find by username/email, unique constraints)
- ✅ Year operations (create, find, update status, fishing lock)
- ✅ Team operations (create, find by year, update members)
- ✅ Competition data (fish weights, chug times, golf scores)
- ✅ Query operations by year/team

### 5. API Integration Tests (`api.test.ts`)
End-to-end tests for API endpoints:
- ✅ GET /api/years - List all years
- ✅ POST /api/auth/register - User registration
- ✅ POST /api/auth/login - User authentication
- ✅ GET /api/auth/user - Get current user
- ✅ Protected route authentication
- ✅ Error handling (invalid JSON, non-existent resources)
- ✅ Validation (missing fields)

## Test Coverage

**Total: 56 tests across 5 test files**

- Database Connection: 6 tests
- Schema Switching: 9 tests
- Authentication: 13 tests
- Storage Layer: 15 tests
- API Integration: 13 tests

## Test Helpers

### `helpers.ts`

**createTestDatabase()**
- Creates an isolated SQLite database for each test
- Uses unique filename to prevent conflicts
- Sets up all required tables
- Returns `{ sqlite, db }` for test use

**seedTestDatabase(sqlite)**
- Populates database with test fixtures
- Creates sample year, team, and user
- Returns IDs for use in tests: `{ yearId, teamId, userId }`

**createMockRequest(overrides)**
- Creates mock Express request object
- Allows customization of body, params, query, session

**createMockResponse()**
- Creates mock Express response object
- Tracks status codes, headers, and response data

## Database-Specific Testing

### SQLite Tests (Default)
All tests run against SQLite by default:
```bash
npm test  # Uses SQLite
```

### PostgreSQL Tests
To test PostgreSQL functionality:
```bash
export DATABASE_URL="postgresql://localhost:5432/test_db"
npm test
```

**Note:** PostgreSQL tests require:
- Running PostgreSQL instance
- Test database created
- Proper connection credentials

## Test Isolation

Each test:
- ✅ Runs in isolation with its own database
- ✅ Cleans up after completion
- ✅ Uses unique database files (no conflicts)
- ✅ Resets environment variables

## Continuous Integration

Tests are designed to run in CI environments:
- No external dependencies (uses SQLite)
- Deterministic results
- Fast execution (~18 seconds)
- Clear pass/fail signals

## Adding New Tests

### 1. Create Test File
```typescript
// tests/my-feature.test.ts
import { describe, it, expect } from 'vitest';

describe('My Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### 2. Use Test Helpers
```typescript
import { createTestDatabase, seedTestDatabase } from './helpers.js';

describe('My Feature', () => {
  let sqlite, db;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
    db = testDb.db;
    seedTestDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('should work with test data', async () => {
    // Your test here
  });
});
```

### 3. Run Tests
```bash
npm run test:watch  # Watches for file changes
```

## Troubleshooting

### Tests Failing Locally
1. Delete any stray test databases: `rm test*.db`
2. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
3. Check Node.js version: Requires Node 18+

### Readonly Database Errors
- Ensure test databases are being cleaned up
- Check file permissions in test directory
- Tests create unique files to avoid conflicts

### Module Caching Issues
- Tests use dynamic imports where needed
- Setup file clears environment between tests
- Use `delete process.env.DATABASE_URL` to reset

## Performance

Test execution time breakdown:
- Auth tests: ~15s (bcrypt hashing is intentionally slow for security)
- Schema tests: ~1s
- Storage tests: ~0.6s
- API tests: ~0.7s
- Database tests: ~1.2s

**Total:** ~18 seconds for full suite

## Future Improvements

Potential test enhancements:
- [ ] PostgreSQL integration tests (requires test DB)
- [ ] Load testing for concurrent requests
- [ ] Migration rollback tests
- [ ] Session expiration tests
- [ ] File upload/download tests
- [ ] WebSocket connection tests
- [ ] Performance benchmarks
