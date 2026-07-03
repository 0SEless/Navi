---
phase: studio-code-review
reviewed: 2026-07-02T18:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - src/app/sandbox/osm-import/page.tsx
  - src/components/figma/ImageWithFallback.tsx
  - src/components/floor-editor/FloorEditorCanvas.tsx
  - src/components/floor-editor/ComponentProperties.tsx
  - src/components/floor-editor/__tests__/FloorEditorCanvas.test.tsx
  - src/components/studio/StudioWorkspace.tsx
  - src/components/studio/StudioCanvas.tsx
  - src/components/studio/RightPanel.tsx
  - src/components/studio/LeftPanel.tsx
  - src/components/studio/MetadataPanel.tsx
  - src/components/map/PublicMap.tsx
  - src/components/map/CampusMap.tsx
  - src/components/map/PanoramaViewer.tsx
  - src/components/pages/RouteTesting.tsx
  - src/engine/component-compiler.ts
  - src/types/nav-types.ts
  - src/types/studio-types.ts
  - src/app/(admin)/studio/[id]/edit/page.tsx
findings:
  critical: 7
  warning: 8
  info: 5
  total: 20
status: issues_found
---

# Studio Code Review Report

**Reviewed:** 2026-07-02T18:00:00Z
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

20 issues found across 18 source files: 7 critical (block compilation), 8 warnings (runtime correctness), 5 info (code quality).

The most severe finding: `npx tsc --noEmit` produces **7 TypeScript errors across 4 files**. These are not style warnings — they are type errors that block compilation. `npx eslint src/ --format json` reports 0 errors/0 warnings (with 2 suppressed warnings hiding real issues). All 90 tests pass but provide zero coverage of the failing TS paths.

Additionally, pervasive stale-state patterns in `ComponentProperties.tsx` and `MetadataPanel.tsx` mean the UI panels display stale data when switching between selections. Multiple `!.` non-null assertions will crash at runtime if upstream conditions change.

---

## Critical Issues (Block Compilation)

### CR-01: ImageWithFallback passes incompatible props to `next/image` (5 TS errors)

**Files:**
- `src/components/figma/ImageWithFallback.tsx:22`
- `src/components/figma/ImageWithFallback.tsx:26`

**Issue:** The component accepts `React.ImgHTMLAttributes<HTMLImageElement>` and spreads `...rest` into `<Image>`. But `next/image` has stricter prop types than `<img>`:

1. **Line 22:** `<Image width={88} height={88} {...rest}>` — `rest` contains arbitrary HTML img attrs; but `rest` also includes `src` which is `string | undefined` from HTML attrs, while `next/image`'s `src` expects `string | StaticImport`. Also `width`/`height` are `number | undefined` from HTML but `next/image` expects `number | \`${number}\``.
2. **Line 22:** `data-original-url={src}` — `src` is `string | undefined`, and `data-original-url` is not a valid `next/image` prop.
3. **Line 26:** `<Image src={src} ... {...rest}>` — `src` is `string | undefined`, incompatible with `StaticImport | string`. Width/height of `0` with `...rest` creates same mismatches.

**Fix:** Replace `next/image` with a regular `<img>` tag, or map only `next/image`-compatible props explicitly:

```tsx
export function ImageWithFallback(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [didError, setDidError] = useState(false)
  const { src, alt, style, className, ...rest } = props

  if (didError) {
    return (
      <div className={`inline-block bg-gray-100 text-center align-middle ${className ?? ''}`} style={style}>
        <div className="flex items-center justify-center w-full h-full">
          <img src={ERROR_IMG_SRC} alt="Error loading image" width={88} height={88} data-original-url={src} />
        </div>
      </div>
    )
  }

  return (
    <img src={src} alt={alt ?? ''} className={className} style={style} {...rest} onError={handleError} />
  )
}
```

---

### CR-02: osm-import — `unknown` not assignable to `ReactNode`

**File:** `src/app/sandbox/osm-import/page.tsx:133`

**Issue:** `result.query.bbox` accesses `.bbox` on `Record<string, unknown>`, yielding `unknown`. JSX cannot render `unknown`.

```tsx
BBox: {result.query.bbox}  // TS2322: unknown not assignable to ReactNode
```

**Fix:** Cast or stringify:

```tsx
BBox: {String(result.query.bbox)}
```

---

### CR-03: osm-import — comma operator in JSX expression

**File:** `src/app/sandbox/osm-import/page.tsx:223`

**Issue:** The intended literal text `{lat, lng}` inside `<label>` is interpreted as a JSX expression containing a comma operator (TS18007). `lat` and `lng` happen to be in-scope state variables (`useState('11.8195')` / `useState('122.0922')`), so this would return `lng` (a string) — rendering `122.0922` instead of the intended `{lat, lng}` text.

```tsx
<label style={{ ... }}>
  Boundary polygon (JSON array of {lat, lng})  // TS18007 + wrong render
```

**Fix:** Wrap literal text including braces:

```tsx
<label style={{ ... }}>
  {'Boundary polygon (JSON array of {lat, lng})'}
</label>
```

---

### CR-04: FloorEditorCanvas — `maplibregl.EventHandler` does not exist

**File:** `src/components/floor-editor/FloorEditorCanvas.tsx:404,411`

**Issue:** Two places cast through `as unknown as maplibregl.EventHandler`. The type `EventHandler` does not exist in `@types/maplibre-gl`. The cast suppresses any type checking entirely — if `maplibregl.Map.on()` expects a different signature for 3-argument overloads, this will silently break.

```tsx
map.on('mousedown', 'floor-vertex-handles-layer', onMouseDown as unknown as maplibregl.EventHandler)
```

**Fix:** Remove the type assertion and let TypeScript infer the correct overload:

```tsx
map.on('mousedown', 'floor-vertex-handles-layer', onMouseDown as maplibregl.MapMouseEvent & { originalEvent: MouseEvent } & EventHandler)
```

Or if the type truly can't be expressed, cast through `as any` (which at least acknowledges defeat) rather than the misleading non-existent `maplibregl.EventHandler`.

---

### CR-05: StudioWorkspace passes `mapId` to prop-less `RightPanel`

**File:** `src/components/studio/StudioWorkspace.tsx:34`

**Issue:** `RightPanel` declares no props (`export function RightPanel()`), but `StudioWorkspace` passes `mapId={mapId}`. TypeScript error: `Property 'mapId' does not exist on type 'IntrinsicAttributes'`.

```tsx
<RightPanel mapId={mapId} />
```

**Fix:** Either remove the prop:

```tsx
<RightPanel />
```

Or add `mapId` to `RightPanel`'s interface if it's needed downstream.

---

### CR-06: FloorEditorCanvas test — Building missing required properties

**File:** `src/components/floor-editor/__tests__/FloorEditorCanvas.test.tsx:98-104`

**Issue:** The `Building` type requires `baseElevation: number` and `height: number` (no `?`). The test building object omits both.

```ts
const building: Building = {
  id: 'BLD01', name: 'Test Building', campusId: 'asu-ibajay',
  floors: [0], footprint: [{ lat: 11.8195, lng: 122.0922 }],
  // missing baseElevation, height
}
```

**Fix:**

```ts
const building: Building = {
  id: 'BLD01', name: 'Test Building', campusId: 'asu-ibajay',
  floors: [0], footprint: [{ lat: 11.8195, lng: 122.0922 }],
  baseElevation: 0, height: 10,
}
```

---

### CR-07: FloorEditorCanvas test — `Function` not assignable to handler type

**File:** `src/components/floor-editor/__tests__/FloorEditorCanvas.test.tsx:46-49`

**Issue:** When `layer` is narrowed by `typeof layer === 'function'`, TypeScript infers the type as `Function` (from `unknown` narrowing), which is incompatible with `(...args: unknown[]) => void`.

```ts
on(event: string, layer?: unknown, handler?: (...args: unknown[]) => void) {
  const fn = typeof layer === 'function' ? layer : handler!  // layer is Function, not (...args) => void
  this._handlers[event].push(fn)  // TS2345: Function not assignable to (...args: unknown[]) => void
}
```

**Fix:** Cast `layer` in the function branch:

```ts
const fn = typeof layer === 'function' ? (layer as (...args: unknown[]) => void) : handler!
```

---

## Warnings (Runtime Correctness)

### WR-01: ComponentProperties — stale useState from props

**File:** `src/components/floor-editor/ComponentProperties.tsx:22-26`

**Issue:** Four `useState` hooks capture initial values from `component` on first render, but never re-sync when `componentId` prop changes.

```ts
const [name, setName] = useState(component?.name ?? '')
const [width, setWidth] = useState(component?.dimensions?.width ?? 4)
const [height, setHeight] = useState(component?.dimensions?.height ?? 5)
const [rangeFrom, setRangeFrom] = useState(component?.range?.from ?? component?.floor ?? 0)
const [rangeTo, setRangeTo] = useState(component?.range?.to ?? (component?.floor ?? 0) + 1)
```

When a user selects Component A, then selects Component B, all fields still show Component A's values until the user manually triggers Save. The `key={selectedId}` on the parent (`FloorEditor.tsx:164`) may mitigate this by forcing re-mount — verify that `selectedId` always changes when switching components.

**Fix:** At minimum, add a `useEffect` to sync state when `componentId` changes:

```ts
useEffect(() => {
  setName(component?.name ?? '')
  setWidth(component?.dimensions?.width ?? 4)
  setHeight(component?.dimensions?.height ?? 5)
  setRangeFrom(component?.range?.from ?? component?.floor ?? 0)
  setRangeTo(component?.range?.to ?? (component?.floor ?? 0) + 1)
}, [componentId])
```

---

### WR-02: MetadataPanel — setState-in-effect (2 instances)

**File:** `src/components/studio/MetadataPanel.tsx:34,43`

**Issue:** Two `useEffect` hooks call `setFallbackBuilding` and `setShowDialog` synchronously. ESLint's `react-hooks/set-state-in-effect` is explicitly suppressed. While not infinite-looping (guards exist), the pattern causes cascading re-renders and violates React's render-phase purity contract. In future React concurrent mode, this could trigger warnings or degraded performance.

**Lines 31-36:**
```ts
useEffect(() => {
  if (building && building !== fallbackBuilding) {
    setFallbackBuilding(building)  // set-state-in-effect
  }
}, [building, fallbackBuilding])
```

**Line 43:**
```ts
setShowDialog(true)  // set-state-in-effect
```

**Fix:** Derive `fallbackBuilding` from `building` via `useMemo` or inline, not via `useEffect`. For the dialog, consider an `useEffect` with explicit guard that does not depend on `setActiveBuilding`.

---

### WR-03: StudioCanvas — suppressed `exhaustive-deps` masks stale closures

**File:** `src/components/studio/StudioCanvas.tsx:396`

**Issue:** The map interaction `useEffect` has `[]` deps but references `handleClick`, `handleDblClick`, `handleMouseDown`, `handleMouseMove`, `handleMouseUp`, and `handleKeyDown`. These handlers close over component state (`tracePoints`, `roomDrag`, `selectedTraceId`, `tool`, etc.). With empty deps, the handlers are captured once on mount and never updated — they always reference the initial values of all state.

**Lines 396 with suppressed rule:**
```ts
// eslint-disable-line react-hooks/exhaustive-deps
```

**Fix:** Use refs for all callback functions so the effect can have empty deps safely, or list all actual dependencies. Most critically, verify that `handleKeyDown` at line 386 (which is a `keydown` listener on `window`) always reads the latest values — if it reads stale state, keyboard shortcuts silently fail.

---

### WR-04: PanoramaViewer — `window.pannellum!` crashes if script not loaded

**File:** `src/components/map/PanoramaViewer.tsx:34`

**Issue:** `window.pannellum!` asserts the global is non-null. If the `pannellum` script fails to load (network error, ad blocker, script blocked by CSP), this throws `Cannot read properties of undefined` at runtime, breaking the entire component.

```ts
viewerRef.current = window.pannellum!.viewer(containerRef.current, {
```

**Fix:** Guard with an early return:

```ts
if (!window.pannellum) {
  console.error('Pannellum script not loaded')
  return
}
viewerRef.current = window.pannellum.viewer(containerRef.current, { ... })
```

---

### WR-05: PublicMap — `c.polygon!` non-null assertion

**File:** `src/components/map/PublicMap.tsx:252`

**Issue:** `c.polygon!` asserts non-null on component polygons. If a component lacks a polygon (valid in the data model), this crashes.

**Fix:** Guard with optional chaining:

```ts
c.polygon?.map(...) ?? []
```

---

### WR-06: component-compiler — `component.polygon!` non-null assertions in map callback

**File:** `src/engine/component-compiler.ts:231-232`

**Issue:** Two `component.polygon!` accesses inside a `.map()` callback. The outer `if` guard (`component.polygon && component.polygon.length >= 2` at line 228) ensures safety at runtime, but if someone removes the guard, these crash silently.

**Fix:** Use a local variable:

```ts
const polygon = component.polygon
if (polygon && polygon.length >= 2) {
  const nodes = polygon.map((pos, i) => ({
    ...
    label: `${component.name} ${i === 0 ? 'Start' : i === polygon.length - 1 ? 'End' : `Pt${i}`}`,
    ...
  }))
```

---

### WR-07: RouteTesting — `routeResult!` non-null assertion

**File:** `src/components/pages/RouteTesting.tsx:140`

**Issue:** `routeResult!` asserts non-null after a `.filter()` that guarantees it — but if the array operation is refactored and the predicate changes, this silently crashes.

**Fix:** Use a guard:

```ts
const result = routeResults.find(...)
if (!result) return null
```

---

### WR-08: CampusMap — NaN in building center when footprint has <3 points

**File:** `src/components/map/CampusMap.tsx:37-39`

**Issue:** When `b.footprint.length >= 3`, the center is computed via `reduce`. When `< 3`, it falls back to `CAMPUS_CENTER`. However, the else branch still calls `b.footprint.reduce(...)` (in StudioCanvas.tsx equivalent), and for empty arrays with initial value `{lat: 0, lng: 0}`, `0 / 0` produces `NaN`. In CampusMap.tsx specifically, the fallback is `CAMPUS_CENTER`, so this single-file risk is limited. But the StudioCanvas.tsx equivalent (`src/components/studio/StudioCanvas.tsx`, function `buildBuildingGeo`) divides by `b.footprint.length` which is 0 for empty arrays.

**Fix:** Add a zero-length guard:

```ts
if (b.footprint.length === 0) return CAMPUS_CENTER
```

---

## Info (Code Quality)

### IN-01: FloorEditor — access to internal `_data` property on MapLibre source

**File:** `src/components/floor-editor/FloorEditorCanvas.tsx:334`

```ts
(src as unknown as { _data?: GeoJSON.FeatureCollection })._data
```

Accessing the private `_data` property is fragile and may break with MapLibre version bumps. Consider using `map.getSource(...).setData(...)` with explicit typed data instead.

---

### IN-02: Imperative style mutations via `onMouseEnter`/`onMouseLeave`

**Files:** 
- `src/components/studio/RightPanel.tsx:107-108,141-142`
- `src/components/studio/LeftPanel.tsx` (multiple lines)
- `src/components/floor-editor/FloorOutliner.tsx` (multiple lines)

**Issue:** Components use `e.currentTarget.style.background = '...'` in event handlers instead of CSS `:hover` pseudo-classes or Tailwind `hover:` variants. This is incompatible with React's declarative model and may cause style flickering or inconsistent states, especially with React 19 concurrent features.

**Fix:** Use CSS classes/styled-components with `:hover` styles, or add a `useState` for hover state per element.

---

### IN-03: Console.log in production code

**File:** `src/components/studio/StudioWorkspace.tsx:20`

```ts
console.log('[StudioWorkspace] render', { mapId, editorMode })
```

Debug logging in a production component. Remove or gate behind `process.env.NODE_ENV !== 'production'`.

---

### IN-04: `style={{}}` propagation causes unnecessary re-renders

**Files across the codebase:** Multiple components use inline `style={}` objects inside render. In React, `style={{}}` creates a new object every render, which can cause unnecessary re-renders in memoized children. Prefer extracting styles to const declarations at module level for static blocks.

---

### IN-05: StudioCanvas — `buildBuildingGeo` builds fallback polygon with NaN coordinates

**File:** `src/components/studio/StudioCanvas.tsx` (function `buildBuildingGeo`)

When a building has 0 footprint points, `0 / 0 = NaN` center coordinates. While this won't crash (invalid GeoJSON is silently ignored by MapLibre), it wastes render cycles and produces no visual output. Add an explicit empty-footprint early return.

---

_Reviewed: 2026-07-02T18:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
