# NAVI Design Specification

## Design Direction: Option C — ASU Brand Hybrid

**Style**: Clean, authoritative, light-theme with university branding.  
**Primary Colors**: `#0F5132` (ASU Green), `#D1A11F` (ASU Gold), `#F8FAFC` (Surface).  
**Typography**: Plus Jakarta Sans (headings), Inter/System UI (body).  
**Spacing**: 4/8dp incremental system, generous whitespace.

## Approved Design Decisions

### Core Mathematical Model ✅

The campus is modeled as a weighted directed graph $G = (V, E, W)$ with interconnected subgraphs for buildings and floors. Multi-floor navigation uses penalty-weighted stair/elevator edges. GPS and QR coordinates snap to the nearest graph node.

### Platform Architecture ✅

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + PostGIS)
- **Routing**: Path-based multi-campus (`/campuses/[campusId]/...`)

### Data Hydration: Stale-While-Revalidate ✅

1. **Instant Load** (Phase 1): Browser loads pre-compiled JSON snapshot from cache. A* runs client-side in under 1ms.
2. **Background Revalidation** (Phase 2): Quietly checks for updates via Supabase Realtime. If stale, downloads diff and hydrates without flicker.

### Route Visualization: Layered Polyline ✅

```
Layer 1: Outer Glow  — 12px, opacity 0.3, soft blue
Layer 2: Core Path   — 6px, solid vibrant blue
Layer 3: Flow Arrow  — 2px white, dasharray [8,8], CSS animated
```

### Student Flow: Hybrid Positioning ✅

- **GPS**: Auto-detect outdoors, snap to nearest outdoor node.
- **QR Code**: Scan physical QR on wall → start location snapped to that node.
- **Manual**: Search/select from directory.

### Page Structure

**Public Pages**:
1. Landing / Campus selector
2. Unified Map (`/campuses/[campusId]/map`): Map, Directory, Routing Panel

**Admin Pages**:
1. Login (Google OAuth)
2. Dashboard (`/admin/dashboard`): Multi-campus management
3. NAVI Studio (`/admin/campuses/[campusId]/studio`): Visual map editor
4. Panoramas: 360° image manager
5. Departments: Faculty/directory manager
6. QR Generator: Print-ready QR codes for nodes

**API Routes**:
1. `/api/campuses`
2. `/api/campuses/[campusId]/graph`
3. `/api/floor-plans`

## Pending Approval

- Section 3: NAVI Studio (Admin Editor) detailed layout
- Section 4: Testing & validation strategy for thesis defense
