# Error Ledger

## 2026-07-23: BuildingTracer / CampusBoundary drawing ref cleanup loop
- **Error**: Points were not being added in Building and Boundary modes. Clicking the map produced no ConfirmBar.
- **Cause**: `useBuildingTracer` / `useCampusBoundary` had `drawing` in the `useEffect` dependency array of the main click-handler effect. `drawing` from `useDrawingSession()` is a new object reference on every render (new arrays for `tracePoints`/`drawPoints`). Every time a point was added (via `setDrawPoints`), React re-rendered, the effect cleanup ran, clearing `pointsRef.current = []` and calling `drawing?.clearDrawPoints()`, obliterating all accumulated points.
- **Fix**: Added `drawingRef` (`useRef(drawing)`, sync on every render). Removed `drawing` from dependency arrays of the two main effects. Used `drawingRef.current` (and a local `const d = drawingRef.current` captured at effect start) inside effects. Also removed `drawing?.drawPoints` from sync effect deps (it was a no-op since `drawing` changes every render anyway).
- **Prevention**: Any hook that uses `drawing` from `useDrawingSession()` MUST either (a) store it in a ref and NOT include `drawing` in effect deps, or (b) only include specific stable sub-values (like callbacks from `useCallback` with empty deps). Never include the full `drawing` object in effect deps.
- **Related tasks**: T1 (original bug), T2 (polygon auto-close not testable without T1 fix)

## 2026-07-23: InteractionController stale closure on drawing methods
- **Error**: Enter key did not trigger confirm despite correct event handler code.
- **Cause**: `InteractionController.handleKeyDown` was registered inside `useEffect(() => { ... window.addEventListener('keydown', handleKeyDown) ... }, [map])`. The `drawing` variable in the closure was captured from the render when the effect ran. Since `drawing` changes on every render (new object) and the effect only depends on `[map]`, all `drawing.*` calls inside the handler used stale references.
- **Fix**: Added `drawingRef` (`useRef(drawing)`, synced every render). Replaced all `drawing.*` calls inside event handlers with `drawingRef.current.*`.
- **Prevention**: Event handlers registered inside effects with limited deps must use refs for any value that changes across renders. Pattern: `const ref = useRef(val); ref.current = val` then use `ref.current` inside handlers.
- **Related tasks**: T1, T3

## 2026-07-26: Floor plan ImageSource missing URL on init
- **Error**: `sources.floor-floorplan: missing required property "url"` in MapLibre console, followed by `source "floor-floorplan" not found`
- **Cause**: Initial fix tried `map.addSource('floor-floorplan', { type: 'image', coordinates: [...] } as any)` which MapLibre rejected because `url` is required at construction time
- **Fix**: Removed the floor-plan source+layer from `addSourcesAndLayers()` entirely. The `useEffect` that handles floor plan images now dynamically calls `map.addSource()` + `map.addLayer()` only when `building.floorPlanUrls?.[floor]` is available. When the URL changes, it uses `updateImage()` to update the existing source.
- **Prevention**: MapLibre ImageSource requires `url` at construction; don't add it without a real URL. Use the `updateImage` effect to lazily create the source when data arrives.
- **Related tasks**: Floor editor bugfix: image decode / missing source

## 2026-07-28: FloorEditor crashes on undefined building
- **Error**: `TypeError: Cannot read properties of undefined (reading 'floorPlanUrls')` in FloorEditor component. Crashed entire component, caught by ErrorBoundary.
- **Cause**: `const hasPlan = !!building.floorPlanUrls?.[floor]` at line 71 was called before the `if (!building)` null guard at line 163. When building data hadn't loaded yet or the buildingId didn't exist, `building` was `undefined`, causing `building.floorPlanUrls` to throw. The guard was unreachable.
- **Fix**: Changed all `building.property` accesses to `building?.property` using optional chaining. Moved the "Building not found" guard into the JSX return as a conditional render instead of an early return before hooks, to avoid violating React's rules of hooks (all hooks must be called unconditionally).
- **Prevention**: In components where a value can be `undefined` during loading, either (a) use optional chaining (`building?.property`) everywhere, or (b) if using an early return guard, ensure it's placed BEFORE any accesses to the value but AFTER all hooks. The safest approach is (a) — optional chaining wherever the value is not guaranteed.
- **Related tasks**: Floor workflow verify / live testing

## 2026-07-28: "Cannot remove non-existing layer l-position-marker" console error
- **Error**: `Cannot remove non-existing layer "l-position-marker"` logged to console every time StudioWorkspace mounts without a marker target.
- **Cause**: `removeMarkerSource()` used `try { map.removeLayer(name) } catch {}`, but MapLibre GL JS calls `console.error()` internally before throwing. The try-catch suppressed the throw but not the console output.
- **Fix**: Changed to `if (map.isStyleLoaded?.()) { if (map.getLayer(name)) map.removeLayer(name) }`. `map.getLayer()` returns `undefined` if the layer doesn't exist, avoiding the error entirely.
- **Prevention**: Never rely on try-catch to suppress MapLibre errors — check layer/source existence with `getLayer()`/`getSource()` before removing. Always guard style-dependent operations with `isStyleLoaded()`.
- **Related tasks**: Studio workspace cleanup

## 2026-08-01: NavGraph integration tests must assert emitted shape, not primitive shape
- **Error**: 3/4 tests in 
oad-entrance-link.test.ts failed (`findExplicitLinkEdge` returned null) even though compile succeeded and the entrance?road edge existed.
- **Cause**: Asserts ran against the EMITTED `NavigationGraph` but filtered on primitive-graph fields: `n.kind === 'entrance_portal'` (emitted nodes use `type`), `toNode.source.entityId` (emitter strips source into `properties: {}`), `e.accessType` (emitted edges are only `walk/stairs/elevator/transition`). Also entrance_portal emits TWO NavNodes (`outdoor` at outdoorPosition + `entrance` at indoorPosition), so `kind` lookups find nothing.
- **Fix**: Rewrote the test helpers against emitted semantics: outdoor node via `type === 'outdoor'`, road identification by position (waypoints near the road's lat), incident-edge distance assertions.
- **Prevention**: For compileV2 integration tests, check packages/compiler/src/emitter/index.ts first. Primitive phase (kind/accessType/source) is only visible through generatePrimitives; the final NavGraph is type-based with stripped metadata.
- **Related tasks**: T2b

## 2026-08-01: Road snap test fixtures placed second endpoints ~4km from the road
- **Error**: `snaps BOTH endpoints` / `never moves interior points` / `respects a custom radius` failed with `expected 1 to be 2`.
- **Cause**: Test math error � second endpoints used lng 121.53 while the fixture road spans 121.49?121.51 (4.3km east of the road's east end), so they were never within any radius. Implementation was correct; fixtures were wrong.
- **Fix**: Moved second endpoints to (14.50002, 121.51) � ~2m from the road's east end.
- **Prevention**: When building snap tests, place BOTH candidate endpoints within the fixture road's bounding span. Verify distance assumptions in meters before writing assertions (0.0001� � 11.1m).
- **Related tasks**: T2c

## 2026-08-01: CampusBoundary TS narrowing loss inside nested closure
- **Error**: TS2345 - `Argument of type 'Map$1 | null' is not assignable to parameter of type 'Map$1'` at `clearBoundaryDrawing(map)` calls inside completePolygon.
- **Cause**: TypeScript loses the map null-narrowing from the outer effect guard inside nested function closures. The autoConfirm branch added a second call site (line 141), doubling the errors (one pre-existing at the confirm-bar path).
- **Fix**: Captured const m = map after the null guard and used m inside the closure.
- **Prevention**: In hooks where map handlers live in nested closures, capture the narrowed map into a local const immediately after the guard.
- **Related tasks**: T2, T5

## 2026-08-01: eslint react-hooks/refs flags codebase ref-sync pattern

- **Error**: `npx eslint` reports `Cannot access refs during render` (react-hooks/refs) on `ref.current = value` lines in CampusBoundary/OsmImportTool/InteractionController.
- **Cause**: eslint-config-next 16.x enables react-hooks v6 rules. The repo's established pattern (ERRORS.md 2026-07-23) syncs refs during render to avoid stale closures without re-running effects.
- **Fix**: None applied � pattern is required for correctness (drawing/options objects are new every render; putting them in deps reintroduces the 2026-07-23 drawing-clear bug). Accepted as pre-existing repo-wide pattern.
- **Prevention**: When adding new ref-sync lines, expect this rule to fire; match the existing pattern rather than effect-syncing, unless the whole repo migrates.
- **Related tasks**: QA Import Tool Group fixes (Fix 4, Fix 5)

## 2026-08-02: Search results returned component ids instead of graph node ids (routes always null)
- **Error**: On `/map/navigate`, picking any search result produced `fromNode`/`toNode` equal to component ids (`rm-main-101`) that don't exist in the graph, so `aStar` returned null and no route/steps ever rendered. Chips displayed raw ids (`rm-main-101`) instead of labels.
- **Cause**: Two-part mismatch. (1) `campus-search.ts` room results set `id: c.id` (component id) and never set `nodeId`; the page's `pick()` fell back to `r.nodeId ?? r.id`, so the component id was used. (2) The legacy compile() pipeline never sets `componentId` on graph nodes, so there was no bridge from component to node at all.
- **Fix**: (a) `stampComponentIds()` in the API route stamps `componentId` onto room nodes by matching room name within the same building (`bld-main|registrar office` -> `rm-main-101`) — all 24 demo room nodes linked. (b) `campus-search.ts` now resolves `nodeId` for rooms via the `node.componentId` bridge and for buildings via entrance > staircase > any node in the building.
- **Prevention**: Any search/directory feature that feeds a router must resolve to GRAPH node ids, never component ids. The API should always stamp componentId on nodes (real Supabase data from V2 carries it; demo fallback must as well). When writing a picker: assert `nodeById.get(nodeId)` exists before calling aStar.
- **Related tasks**: Demo stitching pass, /map/navigate E2E

## 2026-08-01: SSR hydration mismatch — synchronous localStorage reads at store creation (T8b/T8c)
- **Error**: `Error: Hydration failed because the server rendered HTML didn't match the client` on `/map/home` (and later every page). React diff showed the Recent Destinations chips container vs the empty-state `<p>`, then the SplashOnboarding overlay subtree.
- **Cause**: `public-store.ts` initializes `recentDestinations`, `recentSearches`, and `onboardingComplete` by reading `localStorage` SYNCHRONOUSLY at store creation (`loadArray(...)`, `localStorage.getItem(ONBOARDING_KEY)`). SSR has no localStorage → empty/default; the client's FIRST render already has persisted data → hydration mismatch. Deterministic repro: fresh context → search submit writes recents → reload home. Second occurrence (T8c): after completing onboarding, every page reload mismatched because SSR rendered the overlay but the client first render hid it.
- **Fix**: Render-gating at the three consumers using a shared `useHydrated()` hook (`src/hooks/useHydrated.ts`: `useState(false)` + effect → `true`). HomeDashboard recents + search page recent-searches render the SSR-identical empty branch pre-hydration; SplashOnboarding returns `null` until hydrated (no-flash variant for returning users). Store left as-is (sync reads) — all consumers now gate.
- **Prevention**: ANY store state seeded from `localStorage`/`sessionStorage` at creation will mismatch SSR. Either seed empty + hydrate in an effect, or render-gate every consumer behind `useHydrated()`. Grep rule: `localStorage` inside a `create()` initializer = suspect.
- **Related tasks**: T8b, T8c

## 2026-08-01: Stale `next dev` server holds the `.next` dev lock (ops)
- **Error**: `Another next dev server is already running. Local: http://localhost:3000` — the newly launched `npm run dev -- -p 3210` refused to start; port probes failed.
- **Cause**: A leftover dev server from a previous session kept the `.next` dev lockfile and port 3000.
- **Fix**: `Get-NetTCPConnection -LocalPort 3000` → `taskkill /PID <pid> /F`, then relaunch on 3210. After finishing E2E work, always kill the server (`taskkill /PID` on the port listener).
- **Prevention**: Before any dev-server E2E pass, probe the target port first; kill stale listeners on 3000 AND the target port. Never leave a dev server running after a session.
- **Related tasks**: T8 verification

## 2026-08-01: Playwright `require` fails from outside the project (ops)
- **Error**: `Cannot find module 'playwright'` when running an E2E script from the temp dir.
- **Cause**: Node resolves `require` relative to the script's directory, not cwd.
- **Fix**: `require('C:/Users/Administrator/Desktop/CODEme/Navi/navi-next/node_modules/playwright')` (absolute path) in scripts placed outside the repo.
- **Prevention**: Keep E2E scripts inside the project or require playwright by absolute path.
- **Related tasks**: T8 verification
