# AGENTS.md

This document provides essential information about the KakCup repository architecture, conventions, and workflows for AI agents and developers.

---

## Project Overview

KakCup is a web application for tracking competition data (fish weights, chug times, golf scores) across multiple years and teams. The application uses a modern full-stack architecture with React on the frontend and Express/Node.js on the backend.

---

## Architecture

### Deployment Architecture
- **Platform**: Vercel (serverless functions)
- **Frontend**: Static React app built with Vite, served from CDN
- **Backend**: Express.js wrapped as serverless function in `api/index.ts`
- **Database**:
  - PostgreSQL (production on Vercel)
  - SQLite (local development)
  - Automatic selection based on `DATABASE_URL` environment variable

### Serverless Functions
The application uses Vercel's serverless function model:
- **Entry Point**: `api/index.ts`
- **Handler**: Default export function that wraps the Express app
- **Routing**: All API routes prefixed with `/api/*` are routed to the serverless function
- **Warm Start Optimization**: Express app and routes are initialized at module level to be reused across invocations

### Request Flow
1. Static files (frontend) → Vercel CDN
2. `/api/*` requests → `api/index.ts` serverless function
3. Serverless function → Express router → Database
4. All other routes → `index.html` (SPA routing)

---

## Tech Stack

### Frontend
- **Framework**: React 18
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query)
- **UI Components**: Radix UI primitives + shadcn/ui
- **Styling**: Tailwind CSS v4
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database ORM**: Drizzle ORM
- **Session Store**: PostgreSQL-backed sessions (connect-pg-simple) or SQLite-backed (memorystore)
- **Authentication**: Express sessions with bcrypt password hashing

### Database
- **Production**: PostgreSQL (Neon, Vercel Postgres, or other providers)
- **Development**: SQLite (better-sqlite3)
- **Migrations**: Drizzle Kit
- **Schema**: Dual schema files (`schema-postgres.ts` and `schema-sqlite.ts`) with automatic selection

### Testing
- **Framework**: Vitest
- **Coverage**: V8 coverage provider
- **API Testing**: Supertest for HTTP assertions
- **Timeout**: 10 second default timeout for tests

---

## Project Structure

```
kakcup/
├── api/                    # Vercel serverless functions
│   └── index.ts           # Main serverless entry point
├── client/                # React frontend
│   ├── public/            # Static assets
│   └── src/
│       ├── components/    # React components
│       ├── pages/         # Page components
│       └── main.tsx       # Frontend entry point
├── server/                # Express backend
│   ├── index.ts          # Local dev server entry point
│   ├── routes.ts         # API route definitions
│   ├── auth.ts           # Authentication logic
│   ├── db.ts             # Database connection
│   └── storage.ts        # Data access layer
├── shared/               # Shared code between frontend/backend
│   ├── schema.ts         # Schema export coordinator
│   ├── schema-postgres.ts # PostgreSQL schema
│   └── schema-sqlite.ts   # SQLite schema
├── tests/                # Test files
│   ├── api.test.ts       # API endpoint tests
│   ├── auth.test.ts      # Authentication tests
│   ├── db.test.ts        # Database tests
│   ├── scoring.test.ts   # Business logic tests
│   └── storage.test.ts   # Data access tests
├── data/                 # Seed data (JSON files)
├── scripts/              # Build and deployment scripts
├── dist/                 # Build output
│   └── public/           # Frontend build output (Vercel serves from here)
└── vercel.json           # Vercel deployment configuration
```

---

## Database

### Schema Management
- **Two Schema Files**: Separate schemas for PostgreSQL and SQLite to handle dialect differences
- **Automatic Selection**: `shared/schema.ts` exports the correct schema based on `DATABASE_URL`
- **Tables**: users, years, teams, fishWeights, chugTimes, golfScores, sessions

### Database Selection Logic
```javascript
const isPostgres = !!process.env.DATABASE_URL;
// If DATABASE_URL exists → PostgreSQL
// If DATABASE_URL is empty → SQLite
```

### Migrations
- Run migrations with: `npm run db:push` (Drizzle Kit)
- Initialize Vercel database: `npm run db:init-vercel`
- Local migrations: `npm run db:migrate`

---

## Development Workflow

### Local Development
```bash
npm run dev              # Start development server on port 3000
```
- Uses SQLite database (`kakcup.db`)
- Vite dev server with HMR
- Express API server with live reload (tsx)

### Build Process
```bash
npm run build           # Full production build
npm run vercel-build    # Vercel-specific build (frontend only)
```

Build steps:
1. Inject service worker version
2. Build frontend with Vite → `dist/public/`
3. Bundle server with esbuild → `dist/`
4. Bundle API function with esbuild → `.vercel/output/functions/api/`

### Type Checking
```bash
npm run check          # Run TypeScript compiler without emitting files
```

---

## Testing Requirements

### ⚠️ CRITICAL: Run Tests Frequently

**ALWAYS run tests before committing code.** This project has comprehensive test coverage and tests MUST pass before any changes are merged.

### Test Commands
```bash
npm test                # Run all tests once
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

### When to Run Tests
1. **Before committing**: ALWAYS
2. **After making changes to**:
   - API endpoints (`server/routes.ts`)
   - Business logic (`server/storage.ts`, `shared/`)
   - Authentication (`server/auth.ts`)
   - Database schema (`shared/schema-*.ts`)
3. **During development**: Use watch mode for immediate feedback
4. **Before creating PRs**: Run with coverage to ensure adequate coverage

### Test Files
- `api.test.ts` - Tests all API endpoints
- `auth.test.ts` - Tests authentication flows
- `db.test.ts` - Tests database connections
- `scoring.test.ts` - Tests scoring calculations
- `storage.test.ts` - Tests data access layer

### Test Coverage Requirements
- Exclude: `node_modules`, `dist`, `client`, config files, test files themselves
- Focus on: Server-side logic, API routes, database interactions

---

## Deployment

### Vercel Deployment
The application is deployed on Vercel with the following configuration:

**Build Command**: `npm run vercel-build`
**Output Directory**: `dist/public`

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secure random string (32+ chars)
- `NODE_ENV` - Set to "production"

**Routing Rules** (from `vercel.json`):
- `/api/:path*` → Serverless function at `api/index.ts`
- All other routes → `index.html` (SPA)

### Pre-Deployment Checklist
1. ✅ All tests passing (`npm test`)
2. ✅ TypeScript checks passing (`npm run check`)
3. ✅ Database initialized (`npm run db:init-vercel` with production DATABASE_URL)
4. ✅ Environment variables configured in Vercel dashboard
5. ✅ Build succeeds locally (`npm run build`)

See `DEPLOYMENT.md` for detailed deployment instructions.

---

## Key Patterns and Conventions

### Import Aliases
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

### File Naming
- React components: PascalCase (`YearPage.tsx`)
- Utilities/logic: camelCase (`storage.ts`)
- Tests: `*.test.ts`

### API Routes
- All routes prefixed with `/api`
- RESTful conventions
- Session-based authentication
- JSON request/response bodies

### Environment-Specific Code
The codebase gracefully handles both development and production environments:
- **Database**: Automatic SQLite/PostgreSQL selection
- **Sessions**: Different stores for SQLite vs PostgreSQL
- **Logging**: Enhanced logging in development mode

### Code Quality
- **Type Safety**: Full TypeScript coverage
- **ES Modules**: All files use ES module syntax (`.js` imports even for `.ts` files)
- **No Console in Production**: Terser drops console.log in production builds
- **Session Security**: Sessions stored in database, not memory (production)

---

## Common Tasks for Agents

### Adding a New API Endpoint
1. Add route handler to `server/routes.ts`
2. Add data access methods to `server/storage.ts` if needed
3. Update types in `shared/` if needed
4. **Write tests in `tests/api.test.ts`**
5. **Run tests**: `npm test`

### Modifying Database Schema
1. Update both `shared/schema-postgres.ts` AND `shared/schema-sqlite.ts`
2. Run `npm run db:push` to apply changes
3. Update related storage methods in `server/storage.ts`
4. **Update tests to reflect schema changes**
5. **Run tests**: `npm test`

### Adding Frontend Features
1. Create/modify components in `client/src/components/`
2. Update pages in `client/src/pages/`
3. Use TanStack Query for data fetching
4. Follow existing UI patterns (Radix UI + Tailwind)
5. **Run server tests to ensure API compatibility**: `npm test`

### Debugging Issues
1. Check server logs (Express request logging is enabled)
2. Verify environment variables (`.env.local` for local, Vercel dashboard for production)
3. Check database connection (SQLite file vs PostgreSQL URL)
4. **Run tests to isolate the issue**: `npm test`
5. Use `npm run test:coverage` to identify untested code paths

---

## Performance Considerations

### Frontend Optimization
- Manual code splitting configured in `vite.config.ts`
- Vendor chunks: react-vendor, query-vendor, ui-* chunks
- CSS code splitting enabled
- Terser minification with console.log removal

### Backend Optimization
- Connection pooling for PostgreSQL (max 10 connections)
- Serverless function warm start optimization
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds

### Caching
- Service worker configured (see `scripts/inject-sw-version.js`)
- `/sw.js` served with no-cache headers
- Static assets cached by Vercel CDN

---

## Security Notes

- **Password Hashing**: bcrypt with secure defaults
- **Session Security**:
  - Secure random session secrets (32+ chars required)
  - HttpOnly cookies
  - Database-backed session storage
- **SQL Injection Protection**: Drizzle ORM parameterized queries
- **HTTPS**: Required via sslmode=verify-full for PostgreSQL
- **Environment Variables**: Never commit `.env.*` files (in `.gitignore`)

---

## Important Files to Check

Before making changes, familiarize yourself with these key files:
- `vercel.json` - Deployment configuration
- `package.json` - Scripts and dependencies
- `server/routes.ts` - All API endpoints
- `server/storage.ts` - Data access layer
- `shared/schema.ts` - Database schema coordination
- `tests/` - All test files
- `DEPLOYMENT.md` - Detailed deployment guide
- `SELF_HOSTED.md` - Self-hosting instructions

---

## Summary for AI Agents

When working on this repository:
1. ✅ **ALWAYS run tests** before committing (`npm test`)
2. ✅ Understand the serverless architecture (Vercel + Express wrapper)
3. ✅ Check both PostgreSQL and SQLite schemas when modifying database
4. ✅ Use the correct import aliases (`@/`, `@shared/`, `@assets/`)
5. ✅ Follow existing patterns for API routes and data access
6. ✅ Test changes locally before deploying
7. ✅ Verify TypeScript types with `npm run check`
8. ✅ **Run tests in watch mode during development** (`npm run test:watch`)
