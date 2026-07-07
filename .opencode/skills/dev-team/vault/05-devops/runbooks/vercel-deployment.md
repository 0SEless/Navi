---
tags: [#role/devops, #status/planning]
service: NAVI Web Application
last-updated: 2026-06-20
---

# Vercel Deployment Runbook

## Architecture

```
Browser → Vercel Edge Network
            ├── Static pages (public map, admin UI)
            ├── Next.js API routes (/api/*)
            │       └── Supabase (PostgreSQL + PostGIS)
            └── Images via Cloudinary CDN
```

## Prerequisites

| Item | Source | Status |
|------|--------|--------|
| Vercel account | vercel.com | ✅ |
| Supabase project | supabase.com | ❌ **Needs creation** |
| Cloudinary account | cloudinary.com | ❌ **Needs creation** |
| GitHub repository | github.com | ❌ |
| Custom domain (optional) | Domain registrar | ❌ |

## Environment Variables

### Required in Vercel Dashboard

| Variable | Source | Example |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Project Settings → API | `eyJhbGciOi...` |
| `SUPABASE_URL` | Same as PUBLIC (server-side) | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API (service_role) | `eyJhbGciOi...` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard | `mycloud` |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Cloudinary Settings → Upload | `navi_uploads` |

### Local Development (.env.local)
Copy same vars to `navi-next/.env.local`.

## Deployment Steps

### First Deploy
1. Push code to GitHub repository
2. Import repository in Vercel dashboard
3. Configure:
   - Framework: Next.js
   - Root directory: `navi-next/`
   - Build command: `npx next build`
   - Output directory: `.next`
4. Add all environment variables
5. Deploy
6. Verify: visit `https://<project>.vercel.app/map`

### Subsequent Deploys
- Push to `main` branch → auto-deploys
- PR branches → preview deployment (auto-generated URL)

## Rollback

### Via Vercel Dashboard
1. Go to project → Deployments
2. Find last known-good deployment
3. Click "..." → "Promote to Production"

### Via Git
```bash
git revert HEAD
git push origin main
# Vercel auto-deploys
```

## Monitoring

- **Vercel Dashboard**: Build logs, function logs, analytics
- **Supabase Dashboard**: Database status, API usage, query performance
- **Cloudinary Dashboard**: Storage usage, bandwidth

## Known Issues

| Issue | Workaround |
|-------|-----------|
| Supabase connection pool exhausted under load | Upgrade Supabase plan or add connection pooling via pgBouncer |
| Cloudinary free tier limits (25 GB storage, 25 GB bandwidth) | Optimize image sizes; upgrade plan if exceeded |
| Vercel serverless function cold starts | Keep functions warm with cron job or use Vercel Pro |

## Incident Response

### Site Down
1. Check Vercel Status: https://vercel-status.com
2. Check Supabase Status: https://status.supabase.com
3. Check recent deployments for breaking changes
4. Rollback to last-known-good deployment

### Database Issues
1. Check Supabase dashboard for resource usage
2. Check PostGIS extension is enabled
3. Run `ANALYZE` to update query planner stats
4. Check `supabase/migrations/` for pending migrations

## Links
- [[../../02-architecture/system-map]]
- [[../../01-planning/features/full-system-plan]]
