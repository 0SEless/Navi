# NAVI Public Mobile UI — Design Spec

**Date**: 2026-07-07
**Status**: Draft
**Based on**: Google Stitch project `8314554750751595278`

## Overview

Rebuild the public-facing NAVI interface as a mobile-first responsive app. The existing `PublicMap` component (400+ lines of inline-styled code) is replaced with a modular, route-based architecture that matches the Stitch design. The app uses the existing Supabase data layer (campuses, buildings, graph) with zero backend changes.

## Success Criteria

1. The mobile app renders on phone, tablet, and desktop with appropriate navigation adaptation (bottom nav ↔ sidebar).
2. Explore Map mode displays live buildings from `/api/graph` and shows a bottom sheet on tap.
3. Navigate mode accepts from/to inputs, draws route on map, and shows turn-by-turn steps.
4. Search filters by 7 categories with distance display.
5. Splash/onboarding plays on each entry and transitions to Home Dashboard.

## Route Structure

```
(mobile)/layout.tsx        → AdaptiveShell + SplashOnboarding overlay (plays on entry)
  /home/page.tsx            → Home Dashboard
  /explore/page.tsx         → PublicMap (mode='explore')
  /navigate/page.tsx        → PublicMap (mode='navigate')
  /maps/page.tsx            → Campus/Map selector
  /profile/page.tsx         → Profile screen
  /search/page.tsx          → Search with filter chips
  /buildings/[id]/page.tsx  → Destination Details
auth/
  /login/page.tsx           → Login
  /register/page.tsx        → Register

**Entry flow**: User navigates to `/map` → `(mobile)/layout.tsx` renders SplashOnboarding as a full-screen overlay → Onboarding completes → overlay dismisses, user sees the mobile app shell with Home tab active.
```

## Screens

### 1. Splash + Onboarding
- **Always renders** when user enters `/` (the mobile root).
- Shows NAVI brand mark + "Smart Campus Navigation" tagline with brief loading animation.
- 3-step carousel: "Navigate Your Campus", "Real-time Step Guidance", "Discover Campus Life".
- Controls: Skip (top-right), Next/Get Started (bottom). Dot indicators.
- After completion: navigates to `/home` and sets localStorage flag to skip faster next time.

### 2. Home Dashboard
- Personalized greeting: "Hello, [Name]!" (falls back to "Guest" for unauthenticated).
- Search bar (tapping navigates to `/search`).
- 4 quick action cards in a 2×2 grid:
  - **Navigate** → switches to `/navigate` tab
  - **Explore Campus** → switches to `/explore` tab
  - **360 Panorama** → opens panorama picker/launcher
  - **Emergency** → opens emergency info overlay
- Recent Destinations: horizontal scroll row, stored in localStorage (max 8).
- Campus Announcements: vertical feed, mocked until Phase 4.

### 3. Explore Map
- Full-screen MapLibre GL map (reuses PublicMap internals).
- Floating controls overlaid on map, semi-transparent:
  - **My Location** button (geolocation, blue dot marker)
  - **Zoom In / Zoom Out** (+/-)
  - **Floor Selector** (pill with G/1/2/3, active floor highlighted)
- Tap building → bottom sheet slides up with:
  - Building name, department/type, open/closed status
  - "Navigate" button → switches to Navigate tab with building as destination
  - "Open Panorama" → launches PanoramaViewer (pannellum)
  - Facilities: WiFi, accessibility, elevator, cafe, printing (icons)
  - Upcoming events (if any)
- Bottom sheet snap points: collapsed (48px peek) / half (40%) / full (85%).

### 4. Navigate Map
- Same map as Explore, but routing UI is active.
- Top strip: "From" input (auto-filled via geolocation or QR scan) and "To" input (search).
- "Route" button computes path via graph engine → draws on map using `RouteLine`.
- Bottom sheet shows:
  - Total distance + estimated time
  - Turn-by-turn step list with instruction, distance per step
  - Each step highlights on the map when tapped
- QR scanner accessible from "From" field opens full-screen camera overlay.

### 5. Search
- Full-screen search with auto-focus on open.
- 7 filter chips below search bar: Buildings, Rooms, Labs, Faculty, Offices, Restrooms, Parking.
- Results list: icon, name, location (building + floor), distance from user, "Navigate" button.
- Recent searches section (below results when query is empty, localStorage).
- Empty state: "Search buildings, rooms, and facilities across campus."

### 6. Destination Details
- Building/POI detail view with:
  - Hero image (or placeholder with building color)
  - Building name, location address, status badge (Open/Closed)
  - "Go There" button → Navigate tab with destination set
  - "View 360°" → PanoramaViewer
  - About section (description text)
  - Facilities section (icon grid: WiFi, Accessible, Cafe, Printing, etc.)
  - Departments section (linked list, expandable)
  - Nearby section (cards with other buildings + walking distance)

### 7. Maps Tab (Campus Selector)
- Grid of campus cards showing: name, description, building count.
- Each card is tappable → loads that campus's graph data.
- Active campus is highlighted.
- Uses `/api/campuses` endpoint.

### 8. Auth Screens

**Login**:
- NAVI brand mark at top
- Email + Password inputs
- "Forgot Password?" link
- "Sign In" primary button
- "Continue as Guest" secondary link
- OR divider
- SSO buttons: Google, University ID
- "Don't have an account? Create Account" link

**Register**:
- "Create Your Account" heading with subtitle
- Role selector: Student / Faculty / Staff / Visitor (chip toggle)
- Full Name, Email, Password, Confirm Password inputs
- Terms of Service + Privacy Policy checkbox
- "Create Account" primary button
- "Or register with" secondary options: University ID, Google
- "Already have an account? Sign In" link

### 9. Profile
- User avatar (initials fallback), name, email, role badge.
- Settings section: Theme toggle, Notification preferences (placeholder).
- "Sign Out" button with confirmation dialog.
- Unauthenticated state shows "Sign In" / "Create Account" links.

## Adaptive Layout

| Breakpoint | Navigation | Panel Behavior |
|---|---|---|
| < 640px (phone) | 5-icon bottom bar | Bottom sheet overlays |
| 640–1024px (tablet portrait) | 5-icon bottom bar | Bottom sheet + side peek |
| 1024–1280px (tablet landscape) | Compact sidebar (icons + labels) | Side drawer panels |
| > 1280px (desktop) | Compact sidebar | Side drawer panels |

## Component Architecture

### New Components

| Component | Responsibility |
|---|---|
| `AdaptiveShell` | Layout wrapper: bottom nav on mobile, sidebar on desktop. Handles tab switching. |
| `AdaptiveNav` | Renders as bottom bar (<1024px) or sidebar (≥1024px). 5 tabs with active state. |
| `BottomSheet` | Draggable overlay with configurable snap points. Content slot for child panels. |
| `SplashOnboarding` | 3-step carousel. Always renders on entry. Transitions to `/home` on complete. |
| `HomeDashboard` | Greeting, search bar, 4 quick action cards, recents, announcements. |
| `ExploreMap` | Wraps PublicMap with mode='explore'. Handles building tap → sheet. |
| `NavigateMap` | Wraps PublicMap with mode='navigate'. Handles from/to routing UI. |
| `SearchPanel` | Full-screen search with filter chips, results, recents. |
| `BuildingDetailSheet` | Building detail content for bottom sheet. |
| `BuildingDetailPage` | Full building detail page for `/buildings/[id]`. |
| `CampusSelector` | Grid of campuses for Maps tab. |
| `ProfileScreen` | User profile, settings, sign out. |
| `RouteSteps` | Turn-by-turn direction list. |

### Existing Components (Reused)

| Component | Changes |
|---|---|
| `PublicMap` | Accept `mode` prop, accept overlay slot refs, expose building info extraction |
| `SearchBar` | Restyle to match Stitch design tokens |
| `RouteLine` | No changes |
| `QRScanner` | No changes |
| `BuildingInfo` | Content extracted → used inside `BuildingDetailSheet` |
| `CampusMap` | Used for preview thumbnails in Maps tab |
| `useGeolocation` | No changes |
| `useAuth` / `AuthProvider` | No changes |

### New Store

**`public-store.ts`** (Zustand):

```typescript
interface PublicState {
  activeTab: 'home' | 'explore' | 'navigate' | 'maps' | 'profile'
  sheetState: 'collapsed' | 'half' | 'full' | 'hidden'
  mode: 'explore' | 'navigate'
  fromNode: string | null
  toNode: string | null
  selectedBuilding: Building | null
  
  recentDestinations: string[]      // node IDs
  recentSearches: string[]          // query strings
  onboarded: boolean
  
  // Actions
  setTab: (tab: string) => void
  setSheet: (state: string) => void
  setMode: (mode: 'explore' | 'navigate') => void
  setFrom: (nodeId: string | null) => void
  setTo: (nodeId: string | null) => void
  selectBuilding: (b: Building | null) => void
  addRecentDestination: (nodeId: string) => void
  addRecentSearch: (query: string) => void
  completeOnboarding: () => void
}
```

## Data Flow

```
User Action → PublicStore update → Component rerender
              GraphStore (unchanged) → PublicMap layers update
```

- **Graph data**: `graph-store.ts` → `PublicMap` (unchanged flow)
- **Navigation state**: `public-store.ts` → `AdaptiveNav` highlights + `AdaptiveShell` renders correct page
- **Route calculation**: `from/to` inputs → `graph.findPath()` → `RouteLine` component
- **Building selection**: tap on map → `graph.buildings.find()` → `selectedBuilding` in store → bottom sheet renders
- **Search + filter**: query + active chip → `graph.nodes.filter()` by type/label → results

## Design Tokens

From the Stitch design system:

| Token | Value | Usage |
|---|---|---|
| Primary | `#2563EB` | Buttons, active states, links |
| Secondary | `#0EA5E9` | Accent highlights |
| Tertiary | `#22C55E` | Success, open status |
| Neutral | `#F8FAFC` | Background, cards |
| Font | Geist (existing) | Already in project |
| Radius | 8px cards, 6px buttons | Consistent rounding |
| Shadow | `0 1px 3px rgba(0,0,0,0.08)` | Card elevation |

These already match `globals.css` CSS variables — no token changes needed.

## Error Prevention

| Pitfall | Mitigation |
|---|---|
| Bottom sheet conflicts with map gestures | Sheet captures vertical drag only; map handles horizontal |
| Map remounts on tab switch | Keep PublicMap mounted, toggle overlay visibility |
| Floor plan raster tiles render incorrectly | Use existing bounds-based approach from PublicMap |
| Graph data not loaded before map renders | Use `load()` promise + loading skeleton |
| QR scanner camera permission denied | Graceful error message + manual input fallback |

## Phased Implementation

| Phase | Deliverables | Depends On |
|---|---|---|
| 1 | AdaptiveShell + AdaptiveNav + SplashOnboarding + 5 placeholder pages + public-store | Nothing |
| 2 | HomeDashboard (quick actions, recents, announcements) | Phase 1 |
| 3 | Explore + Navigate map modes + BottomSheet + floor selector | Phase 1 |
| 4 | SearchPanel + filter chips + BuildingDetailSheet/BuildingDetailPage | Phase 3 |
| 5 | Auth screens (login/register) + ProfileScreen | Phase 1 |
| 6 | Maps tab (CampusSelector) + panorama wiring + tablet/desktop polish | Phase 3 |

## What Stays Unchanged

- `engine/` — all graph, routing, geometry code
- `graph-store.ts` — data fetching and state
- `components/map/RouteLine.tsx`
- `components/map/QRScanner.tsx`
- `hooks/useGeolocation.ts` / `hooks/useAuth.ts`
- `middleware.ts`
- `app/api/` — all backend routes
- `lib/` — all utilities
