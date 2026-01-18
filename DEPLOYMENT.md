# Deployment Guide

This application supports deployment to both Railway (traditional Node.js) and Vercel (serverless functions) with automatic database selection based on environment.

---

## Table of Contents
- [Vercel Deployment (Serverless)](#vercel-deployment-serverless)
- [Railway Deployment (Traditional Node.js)](#railway-deployment-traditional-nodejs)
- [Local Development](#local-development)
- [Database Setup](#database-setup)
- [Troubleshooting](#troubleshooting)

---

## Vercel Deployment (Serverless)

### Architecture
Your app now supports Vercel's serverless functions:
- **Frontend**: Static React app served from CDN
- **Backend**: Express app wrapped in serverless function (`api/index.ts`)
- **Database**: PostgreSQL required (SQLite not supported on Vercel)
- **Sessions**: Stored in PostgreSQL database

### Prerequisites
- Vercel account
- GitHub repository connected to Vercel
- PostgreSQL database (Vercel Postgres, Neon, Supabase, or any PostgreSQL provider)

### Step 1: Set Up PostgreSQL Database

#### Option A: Vercel Postgres (Recommended)
```bash
# In Vercel dashboard:
1. Go to Storage tab
2. Create a new Postgres database
3. Copy the DATABASE_URL from the .env.local tab
```

#### Option B: External PostgreSQL (Neon, Supabase, etc.)
```bash
# Get your connection string from your provider:
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```

### Step 2: Initialize Database

**IMPORTANT**: Initialize your database BEFORE deploying to Vercel.

```bash
# Option 1: Initialize using local environment
DATABASE_URL="your-postgres-url" npm run db:init-vercel

# Option 2: Pull Vercel environment variables first
vercel env pull .env.production.local
npm run db:init-vercel
```

This will:
- Create all necessary tables
- Set up indexes
- Import seed data from `data/` directory
- Create session storage table

### Step 3: Configure Vercel Environment Variables

In your Vercel project settings (Settings > Environment Variables), add:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/database
SESSION_SECRET=your-very-secure-random-secret-at-least-32-chars

# Optional
NODE_ENV=production
```

**Generate a secure SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Deploy to Vercel

#### Via GitHub (Recommended)
```bash
git add .
git commit -m "Add Vercel serverless support"
git push origin main
```

Vercel will automatically:
1. Detect the push
2. Run `npm install`
3. Build the frontend (`npm run vercel-build`)
4. Deploy to production

#### Via Vercel CLI
```bash
npm install -g vercel
vercel --prod
```

### Step 5: Verify Deployment

1. Visit your Vercel deployment URL
2. Check that the app loads
3. Test API endpoints (login, data fetching)
4. Monitor function logs in Vercel dashboard

### Vercel Configuration

The `vercel.json` configures:
- **Rewrites**: All `/api/*` requests go to the serverless function
- **Static files**: Served from `dist/public`
- **Function timeout**: 10 seconds (adjust if needed)

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api" }
  ],
  "functions": {
    "api/index.ts": { "maxDuration": 10 }
  }
}
```

### Important Notes for Vercel

1. **Cold Starts**: First request after inactivity may be slower
2. **Connection Pooling**: Optimized for serverless in `server/db.ts`
3. **SQLite Not Supported**: Vercel has ephemeral filesystem - PostgreSQL required
4. **WebSockets**: Not supported in serverless functions (use alternative for real-time features)
5. **Function Limits**: Free tier has execution time limits (10s default, configurable)

---

## Railway Deployment (Traditional Node.js)

Your app is already configured for Railway deployment.

### Prerequisites
- Railway account
- GitHub repository connected to Railway

### Database Setup

#### Option A: Railway PostgreSQL
```bash
# In Railway dashboard:
1. Add a PostgreSQL service
2. Connect it to your app
3. DATABASE_URL is automatically set
```

#### Option B: Use SQLite (Development Only)
```bash
# Leave DATABASE_URL unset
# App will use SQLite automatically
```

### Deploy to Railway

```bash
git push origin main
```

Railway will:
1. Detect the push
2. Run `npm install`
3. Run `npm run build`
4. Start with `npm start`
5. Auto-initialize database on first request

### Railway Configuration

Railway uses:
- **Start command**: `npm start` (runs `node dist/index.js`)
- **Build command**: `npm run build`
- **Port**: Automatically set via `PORT` environment variable

---

## Local Development

### Using SQLite (Default)
```bash
# No DATABASE_URL needed
npm run dev
```

The app will:
- Use SQLite database (`kakcup.db`)
- Auto-initialize database on first run
- Store sessions in SQLite

### Using PostgreSQL Locally
```bash
# Install PostgreSQL locally or use Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:password@localhost:5432/kakcup"

# Initialize database
npm run db:migrate

# Start dev server
npm run dev
```

### Testing Vercel Serverless Locally
```bash
# Install Vercel CLI
npm install -g vercel

# Pull environment variables
vercel env pull .env.local

# Start local serverless environment
vercel dev
```

---

## Database Setup

### Database Selection Logic

The app automatically chooses the database:

```
DATABASE_URL not set → SQLite (local development)
DATABASE_URL set → PostgreSQL (production)
```

### Available Database Commands

```bash
# Initialize Vercel database (PostgreSQL)
npm run db:init-vercel

# Run migrations manually
npm run db:migrate

# Push schema changes (Drizzle)
npm run db:push
```

### Migration Files

- `server/migrate.ts` - Main migration logic
- `scripts/init-vercel-db.ts` - Standalone Vercel initialization
- `server/init-db.ts` - Auto-initialization for Railway/local

---

## Troubleshooting

### Vercel: "Internal Server Error"

**Check function logs:**
```bash
vercel logs
```

**Common issues:**
- DATABASE_URL not set
- Database not initialized
- Session secret not set
- Connection pool exhausted

### Vercel: Database Connection Errors

```
Error: Connection refused at postgresql://...
```

**Solutions:**
1. Verify DATABASE_URL in Vercel environment variables
2. Check database is accessible from Vercel
3. Verify connection string format
4. Check firewall/IP allowlist settings

### Vercel: "Function Timeout"

If requests take longer than configured timeout:
1. Increase timeout in `vercel.json`:
   ```json
   { "functions": { "api/index.ts": { "maxDuration": 30 } } }
   ```
2. Optimize slow database queries
3. Add indexes to frequently queried columns

### Railway: Sessions Not Persisting

**Check:**
1. DATABASE_URL is set (sessions stored in DB)
2. `sessions` table exists
3. SESSION_SECRET is configured

### Local: SQLite Database Locked

```
Error: database is locked
```

**Solutions:**
1. Close other connections to `kakcup.db`
2. Delete `kakcup.db` and restart
3. Use PostgreSQL instead

### Build Fails

```
Error: Cannot find module '@vercel/node'
```

**Solution:**
```bash
npm install
```

### TypeScript Errors

```bash
npm run check
```

Fix any TypeScript errors before deploying.

---

## Performance Optimization

### Vercel-Specific Optimizations

1. **Connection Pooling**: Already configured in `server/db.ts`
   ```typescript
   max: 10, // Maximum connections
   idleTimeoutMillis: 30000, // Close idle connections
   ```

2. **Cold Start Optimization**:
   - Express app initialized at module level (reused across warm starts)
   - Database connections pooled and reused
   - Minimal initialization logic

3. **Static Asset Caching**:
   - Frontend assets served from CDN
   - Aggressive caching headers
   - Code splitting configured in `vite.config.ts`

### Monitoring

**Vercel Dashboard:**
- Function execution time
- Cold start frequency
- Error rates
- Database connection pool usage

**Add monitoring:**
```bash
# Vercel Analytics (optional)
npm install @vercel/analytics
```

---

## Comparison: Vercel vs Railway

| Feature | Vercel (Serverless) | Railway (Traditional) |
|---------|--------------------|-----------------------|
| **Architecture** | Serverless functions | Long-running Node.js |
| **Cold Starts** | Yes (first request) | No |
| **Scaling** | Automatic, instant | Automatic, container-based |
| **Database** | PostgreSQL required | PostgreSQL or SQLite |
| **WebSockets** | Not supported | Supported |
| **Pricing** | Pay per execution | Pay per hour |
| **Best For** | API + static sites | Full-stack apps, WebSockets |

---

## Rollback

### Vercel
1. Go to Deployments in Vercel dashboard
2. Find previous working deployment
3. Click "Promote to Production"

### Railway
1. Go to Deployments in Railway dashboard
2. Click "Redeploy" on previous version

**Note**: Database changes are NOT rolled back automatically. Plan schema changes carefully.

---

## Security Checklist

Before deploying to production:

- [ ] Generate strong SESSION_SECRET (32+ characters)
- [ ] Use HTTPS only (Vercel/Railway provide this automatically)
- [ ] Set secure cookie settings in production
- [ ] Review CORS settings if needed
- [ ] Audit dependencies for vulnerabilities
- [ ] Set up database backups
- [ ] Configure environment variables (never commit secrets)
- [ ] Review database connection string (use connection pooling URLs)

---

## Support

For issues:
- **Vercel**: https://vercel.com/docs
- **Railway**: https://docs.railway.app
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Drizzle ORM**: https://orm.drizzle.team/docs/overview
