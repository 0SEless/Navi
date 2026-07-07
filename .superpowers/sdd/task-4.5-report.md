# Task 4.5 — PublicMap Enhancement

**Status**: Complete

## Files Changed

### Created
- `src/components/directory/BuildingInfo.tsx` — Building info panel showing name, floor range, and POIs when a building is clicked on the map
- `src/app/(public)/map/[campus]/page.tsx` — Dynamic route for campus-specific map page (uses Next.js 15 `params.then()` pattern)

### Modified
- `src/components/map/PublicMap.tsx` — Major enhancements:
  - Replaced inline `<select>` dropdowns with `<SearchBar>` component integration
  - GPS auto-sets `from` (shows as badge), user searches for `to` via SearchBar
  - Added building click detection via `map.queryRenderedFeatures` on `public-buildings-fill` layer
  - Added `<BuildingInfo>` panel that appears when a building polygon is clicked
  - Accepts optional `campusId` prop for future campus filtering
  - Cleaner toolbar layout with badge for current "from" location

## Concerns
- `Building` type at runtime may have `outline` property (not declared in `nav-types.ts` which uses `footprint`) — cast via `(b as any).outline` to match existing pattern
- `findPath` returns `PathResult` but `RouteLine` expects `{ path: string[]; cost: number }` — kept existing cast approach
- SearchBar has internal state, so GPS auto-set of `from` doesn't reflect in SearchBar input — addressed by showing a badge instead of SearchBar when `from` is set
- No campus-level data filtering yet — `campusId` prop is wired but graph store loads all data regardless; multi-campus filter is a future concern
