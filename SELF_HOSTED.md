# Self-Hosting Guide for Raspberry Pi

This document describes how to deploy this application on a self-hosted Raspberry Pi connected to the public internet.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (React + Vite)                    │
│  - TypeScript + TailwindCSS + Radix UI                      │
│  - Client-side routing (Wouter)                             │
│  - TanStack React Query for server state                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Fetch API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          BACKEND (Express.js on Node.js)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ LOCAL: server/index.ts (dev/standalone)                │ │
│  │ SERVERLESS: api/index.ts (Vercel functions)            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  - Express middleware stack                                 │
│  - Session management (database-backed)                     │
│  - Authentication (bcrypt + sessions)                       │
│  - REST API routes                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            DATABASE LAYER (Drizzle ORM)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ SQLite (self-hosted)  │  PostgreSQL (cloud)             │ │
│  │ ./kakcup.db           │  Vercel/Neon/Supabase           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Tables: sessions, users, years, teams, scores              │
└─────────────────────────────────────────────────────────────┘
```

## Why Self-Hosting Works Out of the Box

The codebase was designed with a dual-deployment strategy:

1. **Serverless (Vercel)**: Uses `api/index.ts` as a wrapper around Express
2. **Standalone (Raspberry Pi)**: Uses `server/index.ts` directly

The serverless layer is an *adapter*, not a replacement. The core Express application runs independently.

### Database Strategy

The app automatically selects the database based on environment variables:

```typescript
const isPostgres = !!process.env.DATABASE_URL;
```

| Environment Variable | Database | Use Case |
|---------------------|----------|----------|
| `DATABASE_URL` not set | SQLite (`./kakcup.db`) | Raspberry Pi / Local |
| `DATABASE_URL` set | PostgreSQL | Vercel / Cloud |

## Changes Required for Raspberry Pi

### Core Application Changes: None

The Express server already supports standalone operation with SQLite.

### Environment Configuration

Create a `.env` file with:

```bash
NODE_ENV=production
SESSION_SECRET=<generate-a-secure-random-string>
PORT=3000
# Do NOT set DATABASE_URL - this enables SQLite mode
```

Generate a secure session secret:
```bash
openssl rand -base64 32
```

## Deployment Steps

### 1. Prerequisites

- Raspberry Pi with Raspberry Pi OS (64-bit recommended)
- Node.js v20 LTS installed
- Git installed

### 2. Clone and Build

```bash
git clone <repository-url>
cd kakcup
npm install
npm run build
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with production values
```

### 4. Initialize Database

```bash
npm run db:migrate
```

This creates `./kakcup.db` with all tables and seed data.

### 5. Start the Server

```bash
npm start
```

The server runs on `http://localhost:3000` by default.

### 6. Configure Auto-Start (systemd)

See `/setup` directory for systemd service configuration files.

Example service file (`/etc/systemd/system/kakcup.service`):

```ini
[Unit]
Description=KakCup Application
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/kakcup
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable kakcup
sudo systemctl start kakcup
```

## Exposing to the Internet

### Option 1: Cloudflare Tunnel (Recommended)

Cloudflare Tunnel provides secure public access without opening ports on your router.

See `/setup/README.md` for detailed Cloudflare Tunnel configuration.

Benefits:
- No port forwarding required
- Automatic HTTPS
- DDoS protection
- Zero Trust security model

### Option 2: Nginx Reverse Proxy + Let's Encrypt

Install nginx and certbot:
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Configure nginx (`/etc/nginx/sites-available/kakcup`):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and get SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/kakcup /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo systemctl restart nginx
```

### Option 3: Direct Port Forwarding (Not Recommended)

Forward port 3000 (or 80/443) on your router to the Raspberry Pi. This exposes your Pi directly to the internet and is not recommended for security reasons.

## Files You Can Ignore for Self-Hosting

These files are only used for Vercel serverless deployment:

| File | Purpose |
|------|---------|
| `api/index.ts` | Vercel serverless function wrapper |
| `vercel.json` | Vercel deployment configuration |
| `.vercel/` | Vercel project metadata |

These npm packages are unused in self-hosted mode:
- `@vercel/node`
- `@neondatabase/serverless`
- `connect-pg-simple` (PostgreSQL sessions)

## API Routes Reference

All routes are served from the Express backend:

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/api/auth/login` | User login | Public |
| POST | `/api/auth/register` | User registration | Public |
| POST | `/api/auth/logout` | End session | Authenticated |
| GET | `/api/auth/user` | Current user info | Authenticated |
| GET | `/api/years` | List competition years | Public |
| GET | `/api/years/:year` | Get specific year | Public |
| PATCH | `/api/years/:yearId` | Update year | Admin |
| GET | `/api/years/:yearId/teams` | Get teams for year | Public |
| POST | `/api/years/:yearId/teams` | Create team | Admin |
| PUT | `/api/teams/:teamId` | Update team | Admin |
| GET/POST | `/api/years/:yearId/fish-weights` | Fish competition | Varies |
| GET/POST | `/api/years/:yearId/chug-times` | Chug competition | Varies |
| GET/POST | `/api/years/:yearId/golf-scores` | Golf competition | Varies |

## Database Schema

Tables created in SQLite:

- `sessions` - Express session storage
- `users` - User accounts with bcrypt password hashes
- `years` - Competition year records
- `teams` - Team entries with member names
- `fish_weights` - Fishing competition scores
- `chug_times` - Chug competition times
- `golf_scores` - Golf competition scores

Schema definitions:
- SQLite: `shared/schema-sqlite.ts`
- PostgreSQL: `shared/schema-postgres.ts`

## Security Considerations

### Already Implemented

- Bcrypt password hashing (12 rounds)
- HTTP-only session cookies
- Secure cookies in production mode
- Database-backed sessions (not in-memory)
- Session cleanup every 15 minutes

### Recommended for Production

1. **Use HTTPS** - Via Cloudflare Tunnel or Let's Encrypt
2. **Strong session secret** - Use `openssl rand -base64 32`
3. **Firewall** - Only expose necessary ports (80/443)
4. **Regular updates** - Keep Raspberry Pi OS and Node.js updated
5. **Backups** - Regularly backup `./kakcup.db`

## Troubleshooting

### Database not initializing
```bash
# Check if SQLite file exists
ls -la kakcup.db

# Re-run migrations
npm run db:migrate
```

### Session issues
- Ensure `SESSION_SECRET` is set
- Check that `NODE_ENV=production` for secure cookies over HTTPS

### Port already in use
```bash
# Find process using port 3000
lsof -i :3000

# Use a different port
PORT=8080 npm start
```

### Permission denied errors
```bash
# Ensure proper ownership
sudo chown -R pi:pi /home/pi/kakcup
```

## Summary

| Aspect | Status |
|--------|--------|
| Core application changes | None required |
| Database | SQLite works automatically |
| Sessions | SQLite-backed, ready to use |
| Authentication | Fully functional |
| External dependencies | None required |
| Setup complexity | Low - mostly configuration |
