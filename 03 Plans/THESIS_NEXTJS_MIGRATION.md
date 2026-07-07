# Vite → Next.js Migration Plan

## Goal
Migrate `navi-admin/` (React + Vite project) to a Next.js 15 App Router project, preserving all functionality. The Vite project stays as reference until migration is verified.

---

## Step 1 — Scaffold Next.js project

```bash
cd C:\Users\Administrator\Desktop\CODEme\Navi
npx create-next-app@latest navi-next --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

This creates `navi-next/` alongside the existing `navi-admin/`.

---

## Step 2 — Copy framework-agnostic code

These are pure TypeScript modules — zero changes needed:

| From (navi-admin) | To (navi-next) |
|-------------------|----------------|
| `src/engine/` | `src/engine/` |
| `src/store/` | `src/store/` |
| `src/types/` | `src/types/` |

```bash
Copy-Item -Recurse navi-admin/src/engine navi-next/src/
Copy-Item -Recurse navi-admin/src/store navi-next/src/
Copy-Item -Recurse navi-admin/src/types navi-next/src/
```

Then delete `navi-next/src/types/route.ts` (merged into nav-types.ts).

---

## Step 3 — Install dependencies

```bash
cd navi-next

# Core
npm install zustand maplibre-gl

# Existing UI
npm install lucide-react recharts sonner clsx tailwind-merge class-variance-authority

# Radix UI components (install only those used)
npm install @radix-ui/react-accordion @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-tooltip
npm install @radix-ui/react-alert-dialog @radix-ui/react-avatar @radix-ui/react-checkbox
npm install @radix-ui/react-collapsible @radix-ui/react-context-menu
npm install @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar
npm install @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress
npm install @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-separator
npm install @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-toggle
npm install @radix-ui/react-toggle-group

# Future
npm install @supabase/supabase-js

# Dev
npm install -D @types/node
```

---

## Step 4 — Set up Tailwind + shadcn/ui

```bash
npx shadcn@latest init -d  # default config
npx shadcn@latest add button card dialog accordion tabs
npx shadcn@latest add select tooltip dropdown-menu input
```

---

## Step 5 — File routing structure

```
src/app/
├── layout.tsx              ← Root layout (html, body, fonts)
├── page.tsx                ← Redirect to /map
├── globals.css             ← Tailwind imports
├── favicon.ico
│
├── (public)/
│   └── map/
│       └── page.tsx        ← Public map view (end-user, no auth)
│
├── (admin)/
│   ├── layout.tsx          ← Admin shell (sidebar + topbar + auth check)
│   ├── login/
│   │   └── page.tsx        ← Login page
│   ├── dashboard/
│   │   └── page.tsx        ← Dashboard
│   ├── map-editor/
│   │   └── page.tsx        ← MapEditor
│   ├── routes/
│   │   └── page.tsx        ← RouteTesting
│   └── dataset/
│       └── page.tsx        ← DatasetManagement
│
├── api/
│   └── graph/
│       └── route.ts         ← GET/POST to Supabase
│
└── middleware.ts            ← Auth check, redirect to /login
```

---

## Step 6 — Component mapping

| Vite File | Next.js Location |
|-----------|-----------------|
| `src/components/layout/AppLayout.tsx` | Merged into `app/(admin)/layout.tsx` |
| `src/components/layout/Sidebar.tsx` | `src/components/layout/Sidebar.tsx` |
| `src/components/layout/TopBar.tsx` | `src/components/layout/TopBar.tsx` |
| `src/components/layout/PageShell.tsx` | `src/components/layout/PageShell.tsx` |
| `src/components/map/CampusMap.tsx` | `src/components/map/CampusMap.tsx` |
| `src/components/ui/*` | `src/components/ui/*` (shadcn) |
| `src/pages/MapEditor.tsx` | `app/(admin)/map-editor/page.tsx` |
| `src/pages/RouteTesting.tsx` | `app/(admin)/routes/page.tsx` |
| `src/pages/DatasetManagement.tsx` | `app/(admin)/dataset/page.tsx` |
| `src/pages/Dashboard.tsx` | `app/(admin)/dashboard/page.tsx` |
| `src/pages/LoginScreen.tsx` | `app/(admin)/login/page.tsx` |
| `src/pages/map-editor/RealMapView.tsx` | `src/components/map-editor/RealMapView.tsx` |
| `src/pages/map-editor/AutoSvgView.tsx` | `src/components/map-editor/AutoSvgView.tsx` |
| `src/pages/map-editor/mockData.ts` | `src/data/mockData.ts` |
| `src/hooks/useAuth.ts` | `src/hooks/useAuth.ts` |
| `src/data/` | `src/data/` |
| `src/lib/utils.ts` | `src/lib/utils.ts` |

---

## Step 7 — Key import changes

| Vite Pattern | Next.js Pattern |
|-------------|----------------|
| `import { X } from './map-editor/types'` | `import { X } from '@/lib/types'` |
| `import { X } from '../../types'` | `import { X } from '@/types'` |
| `import { X } from '../store/graph-store'` | `import { X } from '@/store/graph-store'` |
| Vite env: `import.meta.env.VITE_XXX` | Next.js env: `process.env.NEXT_PUBLIC_XXX` |

---

## Step 8 — Deploy to Vercel

1. Create GitHub repo for `navi-next`
2. Push code
3. Vercel → Import repo → It auto-detects Next.js
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
5. Deploy

---

## Rollback Plan

If Next.js migration breaks:
- The Vite project (`navi-admin/`) remains untouched and working
- `npm run dev` in `navi-admin/` still works
- No data lost — migration only affects code structure

---

## Links

- [[THESIS_IMPLEMENTATION_PLAN]]
- [[THESIS_ARCHITECTURE]]
- [[THESIS_TECH_STACK]]
- [[TODO]]
