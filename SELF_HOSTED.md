# Self-hosting KakCup

KakCup can be self-hosted with the Rust API, a static server for the Preact frontend, and PostgreSQL.

## Requirements

- Node.js and npm to build the frontend.
- Rust and Cargo to build the API.
- PostgreSQL and `psql`; the API requires `DATABASE_URL`.
- A reverse proxy or static server that serves `dist/public`, proxies `/api/*` to the Rust API, and serves `index.html` for other frontend routes.

## Setup

```bash
npm install
export DATABASE_URL='postgresql://user:password@localhost:5432/kakcup'
export JWT_SECRET='replace-with-a-long-random-secret'
export NODE_ENV=production
```

For a **new, empty database only**, run `npm run db:init`. This creates empty tables; it does not import an existing SQLite database or historical data. Never run the initial schema against an existing database. `npm run db:seed-kaks` optionally seeds the roster and backfills matching 2025 teams; see [DEPLOYMENT.md](DEPLOYMENT.md) for its constraints.

Run `npm run build` to build the frontend and release API, then `npm start` to start the API. The API binds to `127.0.0.1:3000` by default; set `PORT` to change the port. It does **not** serve the frontend. Configure your static server and reverse proxy to use the same origin for the frontend and `/api`, so authentication cookies work.

Set a strong `JWT_SECRET` outside local development. `NODE_ENV=production` enables the Secure cookie attribute, so serve the app over HTTPS. Optional Upstash Redis settings and the cache namespace are documented in [DEPLOYMENT.md](DEPLOYMENT.md).

For development, `npm run dev` starts the Rust API and Vite; Vite proxies `/api` to port 3000. See [README.md](README.md) for test commands and [DEPLOYMENT.md](DEPLOYMENT.md) for environment variables.
