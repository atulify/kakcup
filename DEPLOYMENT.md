# Deployment Guide

## Architecture

Vercel serves the Preact/Vite frontend from `dist/public`. Its Rust runtime is
in beta; `api/rust-api.rs` provides the Axum function, and `vercel.json`
rewrites `/api/*` to it. `npm run vercel-build` builds only the frontend;
Vercel builds the Rust function separately from the root `Cargo.toml`. The
service worker build uses Vercel commit or deployment metadata when Git metadata
is unavailable. CLI uploads use `.vercelignore`.

The `/api/*` rewrites preserve the public request path and invoke the Rust
function; clients do not need an `/api/rust-api` URL prefix. npm dependencies
build and test the frontend, not the Rust API runtime.

The Rust router shares configuration and clients across requests. Cached JSON
responses reuse their serialized body when it is provably canonical; legacy,
noncanonical, and unsupported values use the normal JSON parser so response
bytes and ETags remain compatible.

## Environment variables

Set these in the appropriate Vercel environment, or export them before starting
the local API (the Rust server does not load `.env` files automatically):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required. Use the existing database for an existing installation, and an isolated database for preview where possible. |
| `JWT_SECRET` | Strong, private signing secret. `SESSION_SECRET` is the fallback; otherwise the API uses the insecure `dev-secret`, so always configure a secret outside local development. |
| `NODE_ENV` | Set to `production` for Secure authentication cookies. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional Upstash REST endpoint and token; caching is disabled if either is absent. |
| `KAKCUP_CACHE_PREFIX` | Optional literal prefix prepended to every Redis key; include a separator if desired. |
| `PORT` | Local API port; defaults to 3000. The local server binds to loopback. |
| `TEST_DATABASE_URL` | Disposable PostgreSQL database for Rust integration tests, not used by the application. |

Production uses the `kakcup-rust-prod:` prefix. Give preview a different,
nonempty prefix such as `kakcup-preview:` so its reads and invalidations cannot
affect production cache keys. Cache isolation does not isolate the database:
preview writes affect whichever
`DATABASE_URL` it uses. Use separate databases for safe development and tests.
Changing a prefix changes the cache namespace, not the stored database data.

## PostgreSQL initialization and seed

The application requires the existing PostgreSQL schema. For a **new, empty**
database only, with `DATABASE_URL` pointing to that database and `psql`
installed:

```bash
npm run db:init
npm run db:seed-kaks # optional roster seed
```

`db:init` executes both the initial schema and the score-idempotency migration in
one transaction and creates empty tables; it does not import historical data.
It must not be run against an existing production or other populated database.
For an existing installation, apply the additive, repeatable migration before
deploying the API and frontend:

```bash
npm run db:migrate
```

This creates `score_idempotency` without modifying existing scores. Back up the
database and verify `DATABASE_URL` before applying it. Do not remove saved
idempotency records while clients may still retry them: doing so could turn a
delayed retry into a duplicate score.

The SQL roster seed is transactional and safe to repeat: it inserts
missing names without changing existing statuses, then fills missing member IDs
on mapped 2025 teams only where existing IDs agree with the roster. It never
replaces conflicting IDs or changes legacy name columns. It does not create
years, teams, scores, or users.

## Local development and verification

Install Node.js 22.12+ (22.x) or 24+, npm, Rust/Cargo, PostgreSQL and `psql`,
then:

```bash
npm install
export DATABASE_URL='postgresql://user:password@localhost:5432/kakcup'
export JWT_SECRET='local-development-secret'
npm run dev
```

Vite listens on port 5173 and proxies `/api` to the Rust API on
`127.0.0.1:3000`. `npm run build` builds the frontend and release local API;
`npm start` runs only the built API, not a static frontend server. To test,
run `npm test` and use an isolated PostgreSQL database for Rust tests:

```bash
TEST_DATABASE_URL='postgresql://user:password@localhost:5432/kakcup_test' cargo test
```

The integration tests create and drop a dedicated schema in that database.

The Rust API batches multi-key cache invalidations into one Redis `DEL`, preserving
namespace prefixes and sync-token ordering. Bcrypt verification runs on Tokio's
blocking pool rather than an async worker. UUID lookups bind native UUID values
so PostgreSQL can use existing indexes; malformed or noncanonical ID spellings
retain their prior no-match behavior. These optimizations require no migration
or environment changes.

Score reads retry transient failures and retain already-loaded data in memory
while the page remains open; score data is not persisted for offline reading.
Score entry keeps unconfirmed operations in browser local storage without
storing credentials. Once the original admin signs in and connectivity returns,
the client retries the same operation key. Successful replays reattempt cache
invalidation before confirming the save.
Keyed score requests must include both `Idempotency-Key` and `X-Score-User`
(the authenticated admin's user ID). Keys are globally unique and bound to the
original account, route, and payload; reusing one with a different account or
request returns a conflict. Existing unkeyed API requests retain their previous
behavior. While a save is pending, this device blocks conflicting event locks,
score deletion, and year status changes. Other devices cannot see an operation
that has not reached the server, so coordinate before locking or clearing.
Clearing browser storage or losing the device also removes its pending saves.

## Vercel configuration

Connect the repository to Vercel and configure environment variables for each
environment before deploying. The checked-in build command and rewrites build
the static frontend and route API requests to the Rust beta function. Use a
preview database and Redis prefix distinct from production, and configure the
production secret and `NODE_ENV=production`. After a deployment, verify the
frontend and API against the intended environment; do not initialize an
existing database as part of deployment.

Vercel runs `npm ci` with strict lifecycle-script approvals. Review and update
the version-pinned `allowScripts` entries in `package.json` when an approved
dependency changes. `scripts/vercel-npm.sh` maps Vercel's `npm_config_cache_dir`
to npm's supported `npm_config_cache` setting for install and build commands.
