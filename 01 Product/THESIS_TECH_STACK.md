# NAVI Tech Stack

## Frontend

| Technology | Version | Status | Purpose |
|-----------|---------|--------|---------|
| Next.js | 15.x | To migrate | React framework with App Router |
| React | 19.x | To migrate | UI library |
| TypeScript | 5.x | To migrate | Type safety |
| MapLibre GL JS | 5.24.0 | To migrate | Interactive map rendering (open-source Mapbox fork) |
| shadcn/ui (Radix) | latest | To migrate | UI component primitives |
| Tailwind CSS | 4.x | To migrate | Utility-first styling |
| Zustand | latest | To migrate | State management |
| Lucide React | latest | To migrate | Icons |

### To Install

| Technology | Purpose | Phase |
|-----------|---------|-------|
| Pannellum | 360° panorama viewer | 4 |
| html5-qrcode | QR scanner via webcam | 4 |

## Backend / Infrastructure

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| **Supabase** | PostgreSQL database for graph data | 500 MB database + API |
| **Cloudinary** | 360° panorama + building photo storage | 25 GB storage |
| **Vercel** | Hosting for Next.js app | 100 GB bandwidth |
| **OpenStreetMap** | Map tile source (free, no API key) | Unlimited |

## Why Each Choice

### Next.js over plain React
- File-based routing eliminates manual App.tsx switch statements
- API routes keep Supabase keys server-side
- Optimized for Vercel deployment
- Middleware for auth, layouts for admin/public separation

### Supabase over self-managed PostgreSQL
- Serverless — no server to manage
- Free tier sufficient for thesis graph data (< 10 MB)
- Auto-generated REST API
- Works with Next.js server components

### Cloudinary over local storage
- 25 GB free — covers full campus panoramas
- Built-in image optimization + CDN
- No server needed, works via URL

### MapLibre over Mapbox
Free, open-source, same API as Mapbox GL. No rate limits.

### Zustand over Redux
Lighter weight, less boilerplate, sufficient for single-developer project.

## Links

- [[THESIS_DEFINITION]]
- [[THESIS_ARCHITECTURE]]
- [[THESIS_DATA_MODEL]]
- [[THESIS_IMPLEMENTATION_PLAN]]
- [[THESIS_NEXTJS_MIGRATION]]
