# Deployment Guide

This application supports deployment to Vercel with automatic database selection based on environment.

## Quick Start on Vercel

### 1. Prerequisites
- Vercel account
- GitHub repository connected to Vercel
- Vercel Postgres database (optional, but required for production)

### 2. Database Setup

#### Option A: Using Vercel Postgres (Recommended)
```bash
# In Vercel dashboard:
1. Create a new Postgres database
2. Copy the connection string (DATABASE_URL)
3. Add to Project Settings > Environment Variables
```

#### Option B: Using External PostgreSQL
```bash
# Any PostgreSQL provider (Neon, Supabase, Railway, etc.):
1. Create a PostgreSQL database
2. Get connection string: postgresql://user:pass@host:port/dbname
3. Add as DATABASE_URL to Vercel environment variables
```

#### Option C: Local SQLite Only
- Skip database setup - app uses SQLite locally
- Vercel won't work without DATABASE_URL (Vercel has no persistent filesystem)

### 3. Environment Variables

Set in Vercel Project Settings > Environment Variables:

```
DATABASE_URL=postgresql://... (required for production)
SESSION_SECRET=your-very-secure-random-secret (generate a new one!)
NODE_ENV=production
```

**Generate SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy

```bash
# Push to main branch (connected to Vercel)
git push origin main

# Vercel will automatically:
# 1. Build the application
# 2. Bundle server and client
# 3. Deploy to serverless functions
```

### 5. Database Initialization (Automatic!)

**Good news:** Database initialization happens automatically on first app startup! 🎉

When your app starts on Vercel:
1. App checks if database tables exist
2. If missing, runs migrations automatically
3. Data is seeded from JSON files in the repo
4. App is ready to serve requests

**No manual steps needed!** The app handles initialization for you.

#### Optional: Manual Migration

If you prefer to run migrations manually or need to re-seed data:

```bash
# From your local machine
DATABASE_URL="postgresql://..." npm run db:migrate

# Or via Vercel CLI:
vercel env pull    # Downloads env vars
npm run db:migrate # Runs migration against production DB
```

## Database Selection Logic

The app automatically selects the database based on environment:

- **No DATABASE_URL** → SQLite (local development)
- **DATABASE_URL set** → PostgreSQL (production)

### Connection Flow

```
Vercel Deployment
  ↓
DATABASE_URL detected
  ↓
PostgreSQL connection
  ↓
Tables created (if not exist)
  ↓
Data imported from JSON files
  ↓
App ready to serve
```

## Important Notes

### ⚠️ Session Storage
Sessions are stored in the database (not in-memory), so they persist across server restarts and scale horizontally.

### ⚠️ SQLite Not Recommended for Production
On Vercel:
- SQLite files are stored on ephemeral filesystem
- Files are deleted when container shuts down
- Database doesn't persist between deployments
- **Use PostgreSQL for production** ✅

### ✅ Data Initialization & Persistence
On first app startup:
- App automatically initializes database (checks if tables exist)
- Data is imported from `data/` JSON files
- After initialization, data persists in PostgreSQL database
- User can modify data via API or database
- Data stays between deployments (unlike SQLite on ephemeral filesystem)

## Monitoring

After deployment, check:
1. **Build logs** in Vercel dashboard
2. **Function logs** for runtime errors
3. **Database** to verify tables are created

```bash
# Check PostgreSQL tables
psql $DATABASE_URL -c "\dt"
```

## Troubleshooting

### Build Fails
- Check `package.json` build script
- Verify NODE_VERSION compatibility (18+ required)
- Check build logs in Vercel dashboard

### Database Connection Error
```
Error: Connection refused at postgresql://...
```
**Solution:** Verify DATABASE_URL is correct in Vercel environment variables

### Tables Not Created
```bash
# Re-run migration manually:
DATABASE_URL="..." npm run db:migrate
```

### Sessions Not Persisting
- Verify DATABASE_URL is set in production
- Check sessions table exists: `SELECT * FROM sessions;`
- Verify middleware is configured correctly

## Local Testing Before Deploy

Test production build locally:

```bash
# Build
npm run build

# Set test database
export DATABASE_URL="postgresql://localhost:5432/test_db"

# Start production server
npm start

# Test endpoints
curl http://localhost:3000/api/years
```

## Rollback

If deployment fails:
1. Vercel keeps previous deployments
2. Use Vercel dashboard to promote previous version
3. Database changes from migration persist (no automatic rollback)

## Performance Optimization

### Connection Pooling
PostgreSQL connections are pooled by `pg` package. For high-traffic apps, consider:
- Increasing pool size in `server/db.ts`
- Using connection pooler service (pgBouncer, etc.)

### Caching
Session data is stored in database, not cached. For high-traffic:
- Add Redis session store
- Implement API response caching

## Scaling Notes

The app is stateless (sessions in DB), so it scales horizontally on Vercel. No code changes needed for:
- Multiple serverless functions
- Load balancing
- Auto-scaling

## Database Limits

### Vercel Postgres
- Free tier: 256MB storage
- Premium tier: Scalable storage
- Monitor usage in dashboard

### External Providers
- Check provider's limits
- Plan for growth

## References

- [Vercel Postgres Documentation](https://vercel.com/docs/storage/vercel-postgres)
- [Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Deployments](https://vercel.com/docs/deployments)
