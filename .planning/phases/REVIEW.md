---
phase: code-review
reviewed: 2026-06-26T10:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/components/map/CampusMap.tsx
  - src/components/map/PublicMap.tsx
  - src/components/map/PanoramaViewer.tsx
  - src/components/map/QRScanner.tsx
  - src/components/map/RouteLine.tsx
  - src/components/pages/RouteTesting.tsx
  - src/components/pages/DatasetManagement.tsx
  - src/components/pages/LoginScreen.tsx
  - src/components/providers/AuthProvider.tsx
  - src/components/layout/AppLayout.tsx
  - src/app/page.tsx
  - src/app/layout.tsx
findings:
  critical: 2
  warning: 12
  info: 7
  total: 21
status: issues_found
---

# Phase: Code Review Report

**Reviewed:** 2026-06-26T10:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed 12 source files across the map, page, provider, and layout layers. Found 21 issues: 2 critical (auth subscription churn, map lifecycle race), 12 warnings (stale closures, invalid GeoJSON, timer leaks, script injection, QR race conditions), and 7 info items (dead code, type safety gaps). The most impactful bugs are in `AuthProvider.tsx` (supabase client recreated on every render causing subscription churn) and `PublicMap.tsx` (invalid GeoJSON and layer rendering race).

---

## Critical Issues

### CR-01: AuthProvider supabase client recreated on every render — subscription churn

**File:** `src/components/providers/AuthProvider.tsx:32`
**Issue:** `createClient()` is called in the component body (line 32) on every render, creating a new `supabase` client instance each time. The `useEffect` at line 34 lists `[supabase]` as a dependency, causing the effect to unsubscribe/resubscribe the auth listener and re-fetch the session on every single render. This creates a feedback loop: setting user state → re-render → new supabase client → effect re-runs → resets user state → another re-render.

**Fix:** Create the supabase client once with `useRef` or `useMemo(..., [])`:
```tsx
const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
if (!supabaseRef.current) supabaseRef.current = createClient()
const supabase = supabaseRef.current
```
Then use `[supabase]` still works because the ref is stable, OR better: use the ref directly inside the effect and use `[]` deps.

### CR-02: PublicMap building layer coordinate generation produces invalid GeoJSON

**File:** `src/components/map/PublicMap.tsx:132`
**Issue:** The building outline coordinates use `(b as any).outline?.map(...) ?? []`. The Building type defines `footprint` (not `outline`). The `as any` cast hides this type mismatch. If `b.outline` is undefined/null at runtime, the expression evaluates to `[[]]` — an array containing one empty inner array. This is invalid GeoJSON (a Polygon LinearRing must have ≥4 coordinate pairs) and will silently fail in Maplibre.

Additionally, even when `outline` exists, there is no validation that the resulting coordinate ring is closed (first == last) or has sufficient points.

**Fix:** Use the correct property (`footprint`), validate the coordinate array, and handle the empty state:
```tsx
coordinates: [b.footprint.map((p: LatLng) => [p.lng, p.lat])],
```
Add a guard before the features array to skip buildings with empty/invalid footprints.

---

## Warnings

### WR-01: CampusMap — stale closure of onMapLoaded callback

**File:** `src/components/map/CampusMap.tsx:112-117`
**Issue:** The `onMapLoaded` callback is captured in the map 'load' event handler but the effect has `[]` deps. If the parent re-renders and passes a new `onMapLoaded`, the map's load handler still invokes the old one. The same applies to `center` and `zoom` props (lines 108-109) — they are read once during map construction and ignored on subsequent prop changes.

**Fix:** Store the callback in a ref:
```tsx
const onMapLoadedRef = useRef(onMapLoaded)
onMapLoadedRef.current = onMapLoaded
// then in load handler:
onMapLoadedRef.current?.(map)
```

### WR-02: PublicMap — building layer may never render on the map

**File:** `src/components/map/PublicMap.tsx:124`
**Issue:** The building layer effect guards with `if (!map || !map.isStyleLoaded()) return`. Maplibre's `isStyleLoaded()` may return `false` when the effect first runs. Since the effect's dependency array is `[mapInstance, graph]`, nothing in it will change when the style finishes loading (that's a map event, not a React state change). The layer addition code may be silently skipped forever, leaving the map without building footprints.

**Fix:** Add the layer inside a map 'load' event listener, or use `map.once('style.load', ...)` to ensure the style is ready:
```tsx
map.once('style.load', () => addBuildingLayer(map, graph.buildings))
```

### WR-03: PublicMap — user cannot clear start position with geolocation active

**File:** `src/components/map/PublicMap.tsx:67-80`
**Issue:** The geo-resolution effect has `[geo.latitude, geo.longitude, graph, from]` as deps. When the user clicks the clear button on the "from" badge (line 194: `setFrom('')`), the effect re-runs because `from` changed to `''`. Inside, `!from` is `true`, so `setFrom(resolved.id)` immediately re-populates the start position. The user can never truly clear their start while geolocation is active.

**Fix:** Remove `from` from the dependency array. The geo-resolution should only run when coordinates change, not when the user modifies the from-field:
```tsx
}, [geo.latitude, geo.longitude, graph]) // remove 'from'
```

### WR-04: PublicMap — type-unsafe path cost access with falsy-0 edge case

**File:** `src/components/map/PublicMap.tsx:225`
**Issue:** `(path as any).cost ? Math.round((path as any).cost) : Math.round(path.totalDistance)` — if `cost` is `0` (theoretically possible for zero-length route), `0` is falsy, so it falls through to `path.totalDistance`. But `PathResult` from the A* function does not have a `totalDistance` property (it's never set by `aStar`), so this would produce `Math.round(undefined)` = `NaN` in the display.

Additionally, the `as { path: string[]; cost: number }` cast to RouteLine (line 221) lies about the data shape. The `PathResult` type has `path: NavNode[]`, but the actual runtime value from `aStar()` is `{ path: string[], cost: number, steps: ... }`. This works coincidentally but is fragile.

**Fix:** Create a proper typed interface for the data shape returned by both `findPath` and consumed by `RouteLine`:
```tsx
interface RouteData { path: string[]; cost: number; steps: PathStep[] }
const [path, setPath] = useState<RouteData | null>(null)
```

### WR-05: PanoramaViewer — multiple script injections on re-render

**File:** `src/components/map/PanoramaViewer.tsx:37-41`
**Issue:** If the component re-renders while the pannellum script is loading (or fails to load), `scriptLoadedRef.current` is still `false`, so a new `<script src="/pannellum.js">` is appended to `document.body` on every render. This can create dozens of identical script tags, wasting bandwidth and potentially causing race conditions.

**Fix:** Guard with a module-level or ref-based flag that persists across renders:
```tsx
const scriptInjectedRef = useRef(false)
// ...
if (!(window as any).pannellum && !scriptInjectedRef.current) {
  scriptInjectedRef.current = true
  const script = document.createElement('script')
  // ...
}
```

### WR-06: PanoramaViewer — missing script error handling

**File:** `src/components/map/PanoramaViewer.tsx:40`
**Issue:** The dynamically injected script has an `onload` handler but no `onerror` handler. If the script fails to load (404, network error, CDN down), the panorama viewer silently never initializes. The user sees an empty container with no visual feedback.

**Fix:** Add an `onerror` handler that logs or reports the error:
```tsx
script.onerror = () => console.error('Failed to load /pannellum.js')
```

### WR-07: QRScanner — race condition on rapid QR scans

**File:** `src/components/map/QRScanner.tsx:21-28`
**Issue:** When a QR code is scanned, `onScan(nodeId)` is called and then `scanner.stop()` is initiated (async). If another QR code is scanned before the stop promise resolves, `onScan` fires again for the second code. The `.catch(() => {})` silently swallows any stop errors.

Additionally, there is no validation that the decoded QR content is a valid node ID before passing it to `onScan`. While React text rendering escapes HTML-injection, the unchecked nodeId could cause issues if stored or used in non-React contexts (e.g., DOM attributes, URLs).

**Fix:** Add a scanning lock and validate the decoded value:
```tsx
const scanningRef = useRef(false)
// in start callback:
if (scanningRef.current) return
scanningRef.current = true
// validate nodeId format
if (!/^N\d{3}$/.test(nodeId)) { /* error */ return }
onScan(nodeId)
scanner.stop().then(() => { scanningRef.current = false }).catch(...)
```

### WR-08: RouteLine — fitBounds may throw on removed map

**File:** `src/components/map/RouteLine.tsx:90`
**Issue:** `map.fitBounds(bounds, { padding: 80 })` is called without a try/catch. If the map component unmounts during the current render cycle (before the cleanup runs), `fitBounds` on a removed/cleaned map may throw. The cleanup function (line 92-93) wraps layer removal in a try/catch but does not protect the `fitBounds` call.

**Fix:** Wrap fitBounds in try/catch:
```tsx
try { map.fitBounds(bounds, { padding: 80 }) } catch { /* map may be gone */ }
```

### WR-09: RouteTesting — animation timer not cleaned up on unmount

**File:** `src/components/pages/RouteTesting.tsx:112-122`
**Issue:** The 800ms `setTimeout` in `computeRoute()` is not stored in a ref. If the component unmounts before it fires, `setRouteResult` and the animation loop will execute on an unmounted component. The animation loop uses `animRef` for individual step timeouts, but there is no unmount cleanup that clears them.

**Fix:** Use a cleanup effect:
```tsx
useEffect(() => {
  return () => {
    if (animRef.current) clearTimeout(animRef.current)
  }
}, [])
```
And store the initial 800ms timeout in a ref as well:
```tsx
const computeTimeoutRef = useRef<number | null>(null)
computeTimeoutRef.current = window.setTimeout(() => { ... }, 800)
```

### WR-10: RouteTesting — fake disconnected node "N031" hardcoded

**File:** `src/components/pages/RouteTesting.tsx:127`
**Issue:** `setDisconnectedNodes(disconnected.length > 0 ? disconnected : ["N031"])` — when no nodes are actually disconnected, the code creates a fake entry `["N031"]`. This node ID doesn't exist in MOCK_NODES. The UI renders it with a blank name (line 296: `MOCK_NODES.find(...)?.name ?? ""`) and shows it as a disconnected node even though it's fake. This is misleading for testing.

**Fix:** Use an empty array when no disconnections exist:
```tsx
setDisconnectedNodes(disconnected)
```

### WR-11: DatasetManagement — file drop zone captures files but does nothing

**File:** `src/components/pages/DatasetManagement.tsx:155-161`
**Issue:** The `onDrop` handler calls `e.preventDefault()` and sets `importDrag` to false but never reads `e.dataTransfer.files`. Dropped files are silently discarded. Similarly, the "Browse Files" button has no `onClick` handler. The import feature is completely non-functional despite appearing interactive.

**Fix:** Either implement file reading or add a disabled state with a "Coming Soon" indicator:
```tsx
onDrop={(e) => {
  e.preventDefault()
  setImportDrag(false)
  const file = e.dataTransfer.files[0]
  if (file) handleImportFile(file) // or show "not yet implemented"
}}
```

### WR-12: page.tsx — empty catch swallows fetch errors

**File:** `src/app/page.tsx:87`
**Issue:** The `/api/campuses` fetch has `.catch(() => {})` — all errors are silently swallowed. The `.finally()` block does set `campusesLoading` to `false`, but there is no error reporting or user feedback. If the API fails, the fallback campuses are used with no indication of failure.

**Fix:** Log the error and optionally set an error state:
```tsx
.catch((err) => {
  console.error('Failed to load campuses:', err)
  // optionally: setCampusesError('Failed to load campuses')
})
```

---

## Info

### IN-01: CampusMap — center and zoom props ignored after initial render

**File:** `src/components/map/CampusMap.tsx:90-95`
**Suggestion:** The `center` and `zoom` props are used during map construction but not tracked in the dependency array. If these props change, the map won't update. Consider adding a separate effect to call `map.setCenter()` / `map.setZoom()` when props change.

### IN-02: PublicMap — array index used as key for route steps

**File:** `src/components/map/PublicMap.tsx:227`
**Suggestion:** `(step, i)` with `key={i}` — using the index as key for route steps is acceptable for a static list, but if steps are ever reordered or filtered, React may mishandle DOM updates. Consider using a stable key like `step.nodeId` from the step data.

### IN-03: PanoramaViewer — extensive use of `(window as any).pannellum`

**File:** `src/components/map/PanoramaViewer.tsx:26,34`
**Suggestion:** Add a type declaration for the Pannellum API instead of using `as any` everywhere. This would catch API mismatches at compile time.

### IN-04: RouteTesting — toEngineNodes maps fields not in NavNode type

**File:** `src/components/pages/RouteTesting.tsx:107-108`
**Suggestion:** The function spreads `n.svgOffset`, `n.hasQr`, `n.hasPanorama` which don't exist on the `NavNode` interface. These are legacy fields. Clean up the type definitions or handle them explicitly.

### IN-05: AppLayout — searchQuery state stored but never consumed

**File:** `src/components/layout/AppLayout.tsx:45`
**Suggestion:** The `searchQuery` state is read from the input but never used for filtering, search execution, or display. Either implement the search functionality or remove the dead state.

### IN-06: page.tsx — leftover MOCK_AUTH_CHECK comment

**File:** `src/app/page.tsx:25`
**Suggestion:** The standalone `// MOCK_AUTH_CHECK` comment appears to be a leftover marker from development. Remove it.

### IN-07: Cross-module — A* function return type mismatch with PathResult interface

**File:** `src/engine/a-star.ts:48-53` and `src/types/nav-types.ts:67-72`
**Suggestion:** The `aStar` function declares `PathResult | null` as return type but returns `{ path: string[], cost: number, steps: Partial<PathStep>[] }` which is structurally incompatible with the `PathResult` interface (`path: NavNode[]`, `edges: NavEdge[]`, `totalDistance: number`). This type inconsistency cascades through `graph.findPath()` and all consumers. Either fix `aStar` to return a proper `PathResult` or create a separate lightweight type for the A* output.

---

_Reviewed: 2026-06-26T10:00:00Z_
_Reviewer: gsd-code-reviewer (adversarial)_
_Depth: standard_
