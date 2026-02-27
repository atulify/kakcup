# AGENTS.md

This document provides essential information about the KakCup repository architecture, conventions, and workflows for AI agents and developers.

---

## Project Overview

KakCup is a web application for tracking competition data (fish weights, chug times, golf scores) across multiple years and teams. The application uses a modern full-stack architecture with React on the frontend and Hono on the backend.

---

## Architecture

### Deployment Architecture
- **Platform**: Vercel (Edge Runtime for data routes, Node.js for auth)
- **Frontend**: Static React app built with Vite, served from CDN
- **Backend**: Two Vercel serverless functions:
  - `api/index.ts` — **Edge Runtime** (V8 isolate, ~0ms cold start), handles all `/api/*` data routes
  - `api/auth.ts` — **Node.js Runtime**, handles all `/api/auth/*` routes (bcrypt requires Node.js)
- **Database**:
  - PostgreSQL via `@neondatabase/serverless` HTTP driver (production on Neon)
  - SQLite via `better-sqlite3` (local development)
  - Automatic selection based on `DATABASE_URL` environment variable

### Serverless Functions

**`api/index.ts`** — Edge Runtime
- `export const config = { runtime: 'edge' }` — runs in V8 isolate (no Node.js APIs)
- Wraps Hono app with `handle(app)` from `hono/vercel`
- Restores `/api` prefix if Vercel strips it
- Handles all data routes: fish weights, chug times, golf scores, teams, years, standings

**`api/auth.ts`** — Node.js Runtime
- Plain `VercelRequest`/`VercelResponse` handler (no Hono adapter — avoids body stream issues)
- Reads request body from raw stream (Vercel pre-consumes IncomingMessage before function call)
- Handles: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/user`
- Requires `globalThis.crypto` polyfill for `hono/jwt` on Node.js < 18

### Request Flow
1. Static files (frontend) → Vercel CDN
2. `/api/auth/*` requests → `api/auth.ts` (Node.js function)
3. `/api/*` requests → `api/index.ts` (Edge function) → Hono router → Neon HTTP → PostgreSQL
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
- **Runtime**: Edge (V8 isolate) for data routes; Node.js for auth
- **Framework**: Hono
- **Database ORM**: Drizzle ORM
- **Authentication**: JWT in HttpOnly cookie (`token`) — no session store, no DB roundtrip on auth checks
- **Password Hashing**: bcryptjs (runs only in Node.js auth function)

### Database
- **Production**: PostgreSQL on Neon, accessed via `@neondatabase/serverless` HTTP driver (plain HTTPS fetch — no TCP pool, no SSL handshake on cold start)
- **Development**: SQLite (`better-sqlite3`) — injected at startup via `setDb()` in `server/db.ts`
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
│   ├── index.ts           # Edge Runtime entry — data routes
│   └── auth.ts            # Node.js Runtime entry — auth routes
├── client/                # React frontend
│   ├── public/            # Static assets
│   └── src/
│       ├── components/    # React components
│       ├── pages/         # Page components
│       └── main.tsx       # Frontend entry point
├── server/                # Backend (shared between Vercel functions and local dev)
│   ├── index.ts          # Local dev server entry (Hono + @hono/node-server)
│   ├── routes.ts         # Data API route definitions (createDataRoutes)
│   ├── auth-routes.ts    # Auth Hono routes (used in local dev via server/routes.ts)
│   ├── auth.ts           # JWT middleware: isAuthenticated, isAdmin, createToken
│   ├── password.ts       # hashPassword, verifyPassword (bcryptjs — Node.js only)
│   ├── db.ts             # Database connection + setDb() for local dev SQLite override
│   └── storage.ts        # Data access layer (Drizzle-based)
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

## Authentication

### JWT Flow
- **Login**: `POST /api/auth/login` → bcrypt verify → `createToken()` → `Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict`
- **Auth check** (`GET /api/auth/user`): reads `token` cookie → `verify(token, JWT_SECRET, 'HS256')` → returns payload (no DB call)
- **Data route auth** (`isAuthenticated` middleware): reads `token` cookie → verifies JWT → sets `c.var.{userId, role, username, ...}` (no DB call)
- **Admin check** (`isAdmin` middleware): same as above + asserts `role === 'admin'` (no DB call)
- **Logout**: `POST /api/auth/logout` → clears cookie with `Max-Age=0`

### JWT Payload
```typescript
{ userId, username, email, firstName, lastName, role, exp }
```

### Why Two Functions?
`bcryptjs` is pure JS but requires Node.js `crypto` internals and is CPU-intensive (~400ms at cost 12) — unsuitable for Edge's 50ms CPU limit. Auth routes run as a separate Node.js function while all other routes benefit from Edge's near-zero cold start.

---

## Database

### Schema Management
- **Two Schema Files**: Separate schemas for PostgreSQL and SQLite to handle dialect differences
- **Automatic Selection**: `shared/schema.ts` exports the correct schema based on `DATABASE_URL`
- **Tables**: users, years, teams, fishWeights, chugTimes, golfScores

### Database Selection Logic
```javascript
const isPostgres = !!process.env.DATABASE_URL;
// If DATABASE_URL exists → Neon HTTP driver (PostgreSQL)
// If DATABASE_URL is empty → SQLite (local dev)
```

### Neon HTTP Driver
The production database uses `@neondatabase/serverless` instead of `pg`:
- Each query is a plain HTTPS fetch — no persistent TCP connection, no SSL handshake on cold start
- Compatible with Edge Runtime (no Node.js net/tls required)
- `drizzle-orm/neon-http` adapter — identical Drizzle API to `node-postgres`
- **Version**: `@neondatabase/serverless@^0.10.4` — do NOT upgrade to 1.x (breaks drizzle-orm@0.39.x neon-http session API)

### Migrations
- Run migrations with: `npm run db:push` (Drizzle Kit)
- Initialize Vercel database: `npm run db:init-vercel`
- Local migrations: `npm run db:migrate`

---

## Development Workflow

### Local Development
```bash
npm run dev              # Starts API (tsx server/index.ts on :3000) + Vite dev server (proxies /api to :3000)
```
- Uses SQLite database (`kakcup.db`)
- Vite dev server with HMR on :5173
- Hono API server with live reload (tsx) on :3000
- Vite proxies all `/api` requests to `:3000` — no CORS needed

### Build Process
```bash
npm run build           # Full production build
npm run vercel-build    # Vercel-specific build (frontend only — Vercel handles API bundling)
```

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
   - Authentication (`server/auth.ts`, `api/auth.ts`)
   - Database schema (`shared/schema-*.ts`)
3. **During development**: Use watch mode for immediate feedback
4. **Before creating PRs**: Run with coverage to ensure adequate coverage

### Test Files
- `api.test.ts` - Tests all data API endpoints
- `auth.test.ts` - Tests authentication flows (JWT creation, middleware)
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
- `DATABASE_URL` - Neon PostgreSQL connection string
- `JWT_SECRET` - Secure random string (32+ chars) for signing JWTs
- `SESSION_SECRET` - Legacy fallback used if `JWT_SECRET` is absent
- `NODE_ENV` - Set to "production"

**Routing Rules** (from `vercel.json`):
- `/api/auth/:path*` → Node.js function at `api/auth.ts`
- `/api/:path*` → Edge function at `api/index.ts`
- All other routes → `index.html` (SPA)

### Pre-Deployment Checklist
1. ✅ All tests passing (`npm test`)
2. ✅ TypeScript checks passing (`npm run check`)
3. ✅ Database initialized (`npm run db:init-vercel` with production DATABASE_URL)
4. ✅ Environment variables configured in Vercel dashboard (`DATABASE_URL`, `JWT_SECRET`)
5. ✅ Build succeeds locally (`npm run build`)

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
- JWT cookie authentication (HttpOnly, no JS access)
- JSON request/response bodies

### Hono Route Patterns
```typescript
// Data routes (server/routes.ts)
app.get('/api/fish-weights/:yearId', isAuthenticated, async (c) => {
  const yearId = c.req.param('yearId');
  const userId = c.var.userId;      // set by isAuthenticated middleware
  return c.json(data);
});

// Admin routes
app.post('/api/fish-weights', isAdmin, async (c) => {
  const body = await c.req.json();
  return c.json(result, 201);
});
```

### Auth Routes (api/auth.ts)
Auth routes are implemented directly against `VercelRequest`/`VercelResponse` (no Hono adapter):
```typescript
// Read body from stream (Vercel pre-consumes IncomingMessage)
const rawBody = await new Promise<string>((resolve) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});
const { username, password } = JSON.parse(rawBody || '{}');
```

### Environment-Specific Code
- **Database**: Automatic SQLite/PostgreSQL selection via `DATABASE_URL`
- **Auth secrets**: `JWT_SECRET` → `SESSION_SECRET` → `'dev-secret'` (dev fallback)
- **Cookies**: `Secure` flag only in production

### Code Quality
- **Type Safety**: Full TypeScript coverage
- **ES Modules**: All files use ES module syntax (`.js` imports even for `.ts` files)
- **No Console in Production**: Terser drops console.log in production builds
- **Edge-safe code**: No Node.js-specific APIs in `api/index.ts` or `server/routes.ts`

---

## Common Tasks for Agents

### Adding a New Data API Endpoint
1. Add route handler to `server/routes.ts` (use Hono syntax: `c.req.param()`, `c.req.json()`, `c.json()`)
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
1. Check Vercel function logs (two separate functions: `api` and `api/auth`)
2. Verify environment variables (`DATABASE_URL`, `JWT_SECRET` in Vercel dashboard)
3. Check database connection (SQLite file locally, Neon URL in production)
4. For auth issues: check JWT cookie is set (`token` in browser DevTools → Application → Cookies)
5. **Run tests to isolate the issue**: `npm test`

---

## Performance Considerations

### Cold Start
- **Edge function** (`api/index.ts`): ~0ms cold start (V8 isolate — no Node.js boot)
- **Node.js function** (`api/auth.ts`): ~200–500ms cold start (only invoked at login/logout)
- **Neon HTTP driver**: no TCP connection pool — each query is a fresh HTTPS fetch (fast cold start, slightly higher per-query latency vs persistent connection on warm instances)

### Frontend Optimization
- Manual code splitting configured in `vite.config.ts`
- Vendor chunks: react-vendor, query-vendor, ui-* chunks
- CSS code splitting enabled
- Terser minification with console.log removal

### Caching
- Service worker configured (see `scripts/inject-sw-version.js`)
- `/sw.js` served with no-cache headers
- Static assets cached by Vercel CDN

---

## Security Notes

- **Password Hashing**: bcryptjs with secure defaults (runs only in Node.js auth function)
- **JWT Security**:
  - Signed with `HS256` + `JWT_SECRET` (32+ chars recommended)
  - HttpOnly cookie — not accessible from JavaScript
  - `Secure` flag in production (HTTPS only)
  - `SameSite=Strict` — CSRF protection
  - 7-day expiry
- **SQL Injection Protection**: Drizzle ORM parameterized queries
- **HTTPS**: Neon uses SSL; Vercel enforces HTTPS
- **Environment Variables**: Never commit `.env.*` files (in `.gitignore`)
- **Edge-safe**: No secrets or Node.js internals exposed in Edge bundle

---

## Important Files to Check

Before making changes, familiarize yourself with these key files:
- `vercel.json` - Deployment configuration and routing rules
- `package.json` - Scripts and dependencies
- `api/index.ts` - Edge function entry point
- `api/auth.ts` - Node.js auth function
- `server/routes.ts` - All data API endpoints
- `server/auth.ts` - JWT middleware and token creation
- `server/storage.ts` - Data access layer
- `shared/schema.ts` - Database schema coordination
- `tests/` - All test files

---

## Summary for AI Agents

When working on this repository:
1. ✅ **ALWAYS run tests** before committing (`npm test`)
2. ✅ **Two Vercel functions**: Edge (`api/index.ts`) for data, Node.js (`api/auth.ts`) for auth — do not mix Node.js APIs into the Edge function
3. ✅ **Hono syntax** for data routes: `c.req.param()`, `c.req.json()`, `c.json()`, `c.var.userId`
4. ✅ **No `pg` or connection pools** — use `@neondatabase/serverless` neon-http driver (do not upgrade to 1.x)
5. ✅ Check both PostgreSQL and SQLite schemas when modifying database
6. ✅ Use the correct import aliases (`@/`, `@shared/`, `@assets/`)
7. ✅ JWT authentication — no sessions, no `req.session`, no connect-pg-simple
8. ✅ Verify TypeScript types with `npm run check`
