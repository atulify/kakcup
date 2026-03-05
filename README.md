# Arnprior KAK Cup

> *We get together but once a year,*
> *To fish, to golf, to chug some beer,*
> *So raise your glasses for a cheers,*
> *We'll be KAKs for years and years*

An annual tournament platform for tracking scores across three legendary KAK events. 

Built as a mobile-first PWA for use in the field — on the lake, on the course, and at the table.

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
- **Per-event locking** — lock competitions once final to prevent edits
- **Installable PWA** — add to home screen on iOS/Android for standalone use
- **Admin panel** — manage teams, scores, and tournament years
- **Mobile-first** — designed for use on phones at the event

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Preact + Vite + TanStack Query + Wouter + Tailwind CSS |
| Backend | Hono (Edge Runtime on Vercel) |
| Database | PostgreSQL (Neon HTTP driver) / SQLite (local dev) |
| ORM | Drizzle |
| Auth | JWT in HttpOnly cookies |
| Caching | Upstash Redis + ETag |

## Getting Started

```bash
# Install dependencies
npm install

# Run locally (API on :3000, Vite on :5173)
npm run dev

# Run tests
npm test

# Production build
npm run build
```

The local dev server uses SQLite — no database setup required. Set `DATABASE_URL` to a Neon connection string for PostgreSQL.

## Project Structure

```
api/
  index.ts          # Vercel Edge function (data API)
  auth.ts           # Vercel Node.js function (auth — bcrypt needs Node)
server/
  data-routes.ts    # Hono API routes
  auth.ts           # JWT middleware (isAuthenticated, isAdmin)
  storage.ts        # Database operations (Drizzle)
  cache.ts          # Redis caching layer
client/src/
  pages/            # Route components (SelectYear, YearPage, Login, Settings)
  components/       # Tab components (TeamsTab, FishTab, ChugTab, GolfTab, StandingsTab)
shared/
  schema.ts         # Drizzle schema (PostgreSQL + SQLite variants)
tests/              # Vitest test suite
```

## Deployment

Deployed on Vercel with two serverless functions:

- `/api/auth/*` — Node.js runtime (bcrypt requires it)
- `/api/*` — Edge runtime (~0ms cold start)

```bash
npm run vercel-build   # Vite build only; Vercel bundles API functions separately
```

## License

MIT
