---
tags: [architect]
last-updated: 2026-06-20
---

# System Map

## Architecture Overview

NAVI uses Next.js 16 App Router with a hybrid architecture:
- **Admin UI** (`/admin/*`) — authenticated pages for map editing, dataset management, panorama/QR management
- **Public Map** (`/map`) — end-user-facing map with navigation and 360° panorama views
- **API Layer** (`/api/*`) — serverless REST endpoints connecting to Supabase
- **Engine Layer** (`src/engine/`, `src/store/`, `src/types/`) — framework-agnostic core logic

## Services
| Service | Tech | Port | Repo/Path | Managed by |
|---------|------|------|-----------|-----------|
| Web App | Next.js 16 | 3000 | `/` | Vercel |
| Database | Supabase (PostgreSQL + PostGIS) | — | Supabase project | Supabase |
| Images | Cloudinary | — | Cloudinary account | Cloudinary |

## Data Flow
1. **Admin edits map** → Zustand store (localStorage) → "Save to DB" → `/api/graph` → Supabase `graph_snapshots` table
2. **Admin uploads image** → Cloudinary upload widget → Cloudinary CDN → URL stored on Building/Node record in Supabase
3. **Public map loads** → `/api/graph` → Supabase → Zustand store → Maplibre GL renders
4. **User clicks panorama** → Pannellum loads 360° image from Cloudinary URL

## External Integrations
| Service | Purpose | Auth Method | Docs |
|---------|---------|-------------|------|
| Supabase | Database + Auth | API key + service role key | supabase.com/docs |
| Cloudinary | Image CDN | API key + secret | cloudinary.com/documentation |
| Vercel | Deployment | GitHub integration | vercel.com/docs |
| Maplibre GL | Map rendering | None (open source) | maplibre.org |
| Pannellum | 360° viewer | None (open source) | pannellum.org |

## Key Constraints
- Framework-agnostic engine layer must not import Next.js or React
- All image uploads go through Cloudinary (not Supabase Storage)
- API routes use Supabase service role key for server-side access
