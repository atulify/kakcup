# Arnprior KAK Cup

> *We get together but once a year,*
> *To fish, to golf, to chug some beer,*
> *So raise your glasses for a cheers,*
> *We'll be KAKs for years and years*

An annual tournament platform for tracking scores across three legendary KAK events. 

Built as a mobile-first PWA for use in the field — on the lake, on the course, and at the table.
The Modern Tournament theme uses charcoal surfaces, orange accents, and compact score displays for desktop and mobile.

## The Events

| | Event | Format |
|---|---|---|
| :fishing_pole_and_fish: | **Fish Competition** | Top-3 fish weights count per team |
| :beer: | **Beer Chug Relay** | 4-man relay, average time per leg |
| :golf: | **Golf Tournament** | 4-man scramble, lowest score wins |

## Scoring

Teams earn points across all three events. Standings are calculated using a points system:

- 1st place: 7 pts, 2nd: 6 pts, ..., 7th+: 1 pt
- Ties are resolved by splitting points equally (e.g. three teams tied for 2nd share 6+5+4 = 5 pts each)

## Features

- **Multi-year tournaments** — browse and compare results across years
- **Live score entry** — admins can enter scores in real-time during events
- **Weak-connection recovery** — retries interrupted reads and safely reconciles pending score saves without duplicating entries
- **Per-event locking** — lock competitions once final to prevent edits
- **Installable PWA** — add to home screen on iOS/Android for standalone use
- **Admin panel** — manage teams, scores, and tournament years
- **Mobile-first** — designed for use on phones at the event

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Preact + Vite + TanStack Query + Wouter + Tailwind CSS |
| Backend | Rust + Axum, Vercel Rust runtime (beta) |
| Database | PostgreSQL |
| Auth | JWT in HttpOnly cookies |
| Caching | Optional Upstash Redis + ETag |

## Getting Started

Install Node.js 22.12+ (22.x) or 24+, npm, Rust/Cargo and PostgreSQL with
`psql`. Create a local PostgreSQL database, then export its URL
and a local JWT secret. The Rust API does not automatically load `.env` files.

```bash
npm install
export DATABASE_URL='postgresql://user:password@localhost:5432/kakcup'
export JWT_SECRET='local-development-secret'

# Only for a new, empty database:
npm run db:init
# Optional: insert the roster and backfill matching 2025 teams
npm run db:seed-kaks

# Rust API on 127.0.0.1:3000; Vite on :5173 proxies /api
npm run dev
```

`db:init` applies the PostgreSQL schema and score-idempotency migration in a
transaction; it creates empty tables and is not an upgrade or import tool. Do
not run it against an existing database. For an existing installation, apply
the additive score-idempotency migration with `npm run db:migrate` before
deploying the updated API and client. The roster seed inserts missing names without
changing existing statuses and fills missing member IDs for matching 2025
teams only when existing IDs do not conflict. It does not replace conflicting
IDs or alter legacy name columns.

```bash
npm run build       # build the frontend and release local Rust API
npm start           # run the built API (does not serve the frontend)
npm test            # TypeScript shared/frontend tests
TEST_DATABASE_URL='postgresql://user:password@localhost:5432/kakcup_test' cargo test
```

Rust integration tests require a disposable PostgreSQL database and create and
drop a dedicated schema. See [DEPLOYMENT.md](DEPLOYMENT.md) for environment
variables, cache isolation and Vercel deployment details.

## Project Structure

```
api/rust-api.rs     # Vercel Rust function
rust-backend/src/   # Axum API, authentication and PostgreSQL access
rust-backend/tests/ # PostgreSQL integration tests
rust-backend/seed-kaks.sql
migrations/         # Initial PostgreSQL schema
client/src/         # Preact pages and components
shared/             # Frontend scoring logic
tests/              # Vitest tests
```

## Deployment

Vercel serves the Preact build and routes `/api/*` to the Rust function using
Vercel's Rust runtime (beta). `npm run vercel-build` builds only the frontend;
Vercel builds the function separately. CLI uploads use `.vercelignore`.
See [DEPLOYMENT.md](DEPLOYMENT.md) before configuring environments.

## License

MIT
