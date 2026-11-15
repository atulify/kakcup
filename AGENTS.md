# AGENTS.md

Guidance for working on KakCup, a competition tracker for fish weights, chug times, golf scores, teams, and KAKs across multiple years.

## Architecture

- **Frontend:** Preact, Wouter, TanStack Query, Tailwind CSS, and Vite. React imports are aliased to `preact/compat` by Vite.
- **Backend:** Rust and Axum. `rust-backend/src/lib.rs` creates the application, `data.rs` contains data routes and PostgreSQL access, `auth.rs` implements authentication, and `scoring.rs` contains server-side scoring.
- **Vercel:** `api/rust-api.rs` hosts the Axum application using Vercel's beta Rust runtime. `vercel.json` rewrites `/api/*` to that function and serves the Preact SPA for other routes. Vercel serves the frontend from `dist/public`.
- **Database:** PostgreSQL via SQLx. Production uses Neon. Local development and Rust integration tests use PostgreSQL as well; the Rust backend does not support SQLite.
- **Cache:** Optional Upstash Redis REST API. An unset or empty `UPSTASH_REDIS_REST_URL` disables caching. `KAKCUP_CACHE_PREFIX` isolates cache namespaces; production uses `kakcup-rust-prod:` and preview uses `kakcup-preview:`. See `DEPLOYMENT.md`.
- **Authentication:** HS256 JWT in the `token` HttpOnly cookie. Passwords are verified against bcrypt hashes. `JWT_SECRET` falls back to `SESSION_SECRET`, then the insecure `dev-secret`; configure a strong secret outside local development. `NODE_ENV=production` enables the Secure cookie attribute.

## Project layout

```text
api/rust-api.rs        Vercel Rust function
rust-backend/src/      Axum routes, authentication, scoring and PostgreSQL access
rust-backend/tests/    PostgreSQL-backed API integration tests
rust-backend/seed-kaks.sql  Optional KAK roster seed and 2025 team backfill
migrations/            Initial PostgreSQL schema for a new empty database
client/src/            Preact pages, components and API client
shared/                TypeScript schemas and frontend scoring utilities
tests/                 Vitest shared/schema and scoring tests
```

`shared/scoring.ts` is used by the frontend, while `rust-backend/src/scoring.rs` is used by the backend. Keep the implementations aligned; shared language-neutral scoring fixtures live in `tests/fixtures/scoring.json`.

## Development

Install Node.js, npm, Rust/Cargo, PostgreSQL, and `psql`. Set `DATABASE_URL` and `JWT_SECRET`; the Rust server does not load `.env` files itself.

```bash
npm install
npm run dev          # Rust API on 127.0.0.1:3000 and Vite on :5173
npm run check        # TypeScript type checking
npm test             # Vitest shared/frontend tests
TEST_DATABASE_URL='postgresql://user:password@localhost:5432/kakcup_test' cargo test
npm run build        # Vite frontend and release local API
npm start            # release local API only; does not serve static frontend
npm run vercel-build # frontend build; Vercel builds the Rust function separately
```

Rust integration tests require a disposable PostgreSQL database. They create and drop a dedicated schema; do not point them at production. Run relevant tests after changing routes, storage, authentication, scoring, or schema, and run all tests before committing.

For a new **empty** database, `npm run db:init` applies `migrations/0000_petite_sharon_ventura.sql`. It is not an incremental migration and must not be run on an existing database. `npm run db:seed-kaks` optionally inserts missing KAK names and backfills matching 2025 teams without overwriting conflicting IDs; see `DEPLOYMENT.md` for details.

## API and business rules

- Public reads cover years, teams, scores, KAKs, KAK stats, KAK results, and tie-breaks. Mutations require an admin JWT. Login, logout, and current-user routes are under `/api/auth/*`.
- A year can be marked completed only when fishing, chug, and golf are locked. Completion calculates standings and persists champs and boots. Only teams with chug and golf results participate; fish totals use the top three positive weights.
- Event rankings award seven points for first, six for second, and so on down to a minimum of one. Tied teams share the points for the occupied ranks. A tie for first does not select champs until resolved; tied last-place teams can all receive boots.
- Golf tie-break adjustments are available for completed, locked years and update persisted results.
- KAK member IDs coexist with legacy team member name columns. KAK stats and results are cached with shorter TTLs than most data.
- Every mutation must invalidate the affected cache keys. Preview and production must not share a cache namespace when their databases differ.
- Preserve existing API paths, JSON shapes, numeric representations, cookie behavior, validation, and status codes when making changes; the Preact frontend depends on them.

## Deployment and safety

Use a separate Neon preview branch/database and a separate Redis key prefix for preview deployments. Do not run schema initialization, seed scripts, or destructive tests against production. Existing deployments retain their environment variable values until redeployed. Preserve a known-good production deployment for rollback.

The Rust runtime is beta. Verify an actual Vercel preview and the relevant user-facing flows before production changes. See `README.md`, `DEPLOYMENT.md`, and `SELF_HOSTED.md` for current setup and operational instructions.
