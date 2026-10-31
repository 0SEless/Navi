# NAVI Studio 1.5 — E9 Owner Architecture Decisions

**Purpose:** make the E9 audit actionable. This is an owner review sheet, not an implementation approval. Recommendations below are proposed defaults; none is recorded as approved until the owner responds. E9.5/E8.5 behavior remains the baseline.

## What exists today

NAVI supports authored campus terrain polygons with stable IDs and a shared authored campus-local datum, reversible commands, explicit scoped save, IndexedDB drafts, compiler/published-bundle fields, and public 2D MapLibre polygon display. It does not yet support continuous height grids, brush/lasso editing, terrain locks, excavation, terrain mesh generation, or live 3D terrain preview. See audit reports 00–14 for implementation trace and evidence.

## Decision summary

| ID | Subject | Recommended default | Approval timing |
|---|---|---|---|
| E9-01 | Canonical data | One versioned tiled regular height grid; polygon areas remain independent annotations/constraints | Before Phase 1 |
| E9-02 | Horizontal reference | Campus-local projected meters using an owner-provided origin/CRS, through the existing shared transform boundary | **Blocker** before grid coordinate contract |
| E9-03 | Vertical reference | One explicitly named campus datum; keep current MSL/building-relative values unchanged; no automatic conversion | **Blocker** before foundation/excavation |
| E9-04 | Resolution/limits | Provisional 5 m grid, 128×128 tiles, 50k-sample/1 MiB synthetic gate; benchmark before broader cap | Before Phase 1 schema freeze |
| E9-05 | Brush/lasso | Preview-only strokes, one command on release; contextual controls; no global B shortcut | Defaults safe; owner can defer fine UX |
| E9-06 | Locks/conflicts | Locked samples cannot change; locks are reversible; overlapping incompatible foundations block | Before lock/foundation implementation |
| E9-07 | Foundation | Deterministic non-destructive derived operator; building remains authoritative; unknown datum blocks operation | **Blocker** for automatic excavation |
| E9-08 | 3D | MapLibre remains 2D; candidate isolated Three.js preview after separate dependency approval | Can defer until Phase 6 |
| E9-09 | Persistence | Keep one campus terrain scope initially, explicit Save, local drafts on failures | Default; set measured split thresholds before release |
| E9-10 | Publish | Versioned optional grid artifact plus deterministic derived LOD; preserve legacy polygons/bundles | Can defer until Phase 7 |

---

## 1. Data model

### E9-01 — Canonical terrain representation

| Field | Recommendation |
|---|---|
| Why it matters | Brush operations, undo, storage, runtime rendering and imports need one unambiguous source of continuous elevation. Two writable authorities would diverge. |
| Options | Regular height grid; TIN; grid plus independent control elevations; polygons only. |
| Recommended choice | A versioned regular grid is the best first continuous editor model for NAVI’s brush and raster-lasso interaction. Store it as fixed-size tiles, initially 128×128 samples as a provisional format choice. Use stable row/column and tile indexing, deterministic row-major sample order, explicit encoding version and canonical checksum bytes. Float32 heights plus a separate bit validity mask are a reasonable initial encoding; retain the option to add quantized integer encoding after a declared range/error budget. |
| Coexistence | Existing `terrainAreas` remain separate authored polygons/metadata/constraints. Do not silently rasterize a uniform polygon elevation into grid values. A later explicit rasterize/burn-in command may be reversible and user-invoked. |
| Alternatives | TIN is efficient for sparse breaklines but editing/triangulation/undo are more complex. Control points can be handles into grid samples; if persisted as independent constraints, define interpolation, precedence, revision, and conflict semantics first. Polygon-only cannot support continuous brush sculpting. |
| Future adaptability | Import/export adapters can translate DEM/TIN/contour sources into the grid or export derived forms while preserving source provenance and datum. Keep source format and transform metadata. |
| Reversibility | Moderate. Tile size and binary encoding can be versioned; changing the canonical model or interpreting controls as a second authority is difficult. |
| Dependencies/evidence | Owner approves horizontal/vertical metadata, validity semantics and sample cap. Benchmark serialization and editor memory. |
| Owner response |  |

**Decision:** approve tiled regular grid as the single continuous surface source? **Recommended: Yes.** Controls should edit the grid; do not persist independent elevation controls in v1.

## 2. Horizontal coordinate reference

### E9-02 — Projected campus meters

| Field | Recommendation |
|---|---|
| Why it matters | Grid spacing, brush radius, feathering and excavation margins are distances. Degree-space arithmetic is latitude-dependent and unsuitable. |
| Options | Web Mercator; appropriate local projected CRS (for example, a location-appropriate UTM zone); local tangent plane/ENU anchored to a known point; current `CoordinateTransformer` behavior. |
| Recommended choice | Define one campus frame in meters with an explicit CRS/projection identifier, horizontal origin, axis orientation (east/north), units, and transform version. Reuse/extend the core `CoordinateTransformer` as the only world↔campus conversion boundary. Do not create editor-specific or runtime-specific transforms. Web Mercator is already used by existing transform code, but do not assume its scale accuracy is acceptable for terrain without campus location/accuracy requirements. A local projected CRS or ENU may be more suitable, but the owner must provide the campus location and trusted origin/reference. |
| Blocker | **Yes for final grid coordinate contract.** No verified campus survey CRS, trusted origin, or required horizontal accuracy is in this audit. Do not invent survey accuracy or select a UTM zone without location evidence. A temporary synthetic fixture may use a named fake local frame only. |
| Reversibility | Difficult after saved grid coordinates exist; lock the contract before real terrain import. |
| Evidence needed | Owner-provided campus anchor/location, projection/CRS choice, units/axis convention, and accuracy/use requirements. |
| Owner response |  |

## 3. Vertical datum

### E9-03 — One shared campus vertical reference

| Field | Recommendation |
|---|---|
| Why it matters | Excavation, ground-floor placement, entrances, routes and ramps must compare elevations in a common vertical frame. Current fields use different references. |
| Existing semantics | `Building.baseElevation` is documented as meters above sea level; `Floor.elevation` is relative to building base; terrain is relative to an authored campus-local datum. No verified conversion exists. |
| Recommended choice | Add/retain one campus datum identity with name, zero reference, units, status and explicit “authored/not surveyed” state. Terrain samples and future outdoor elevations reference it. Keep existing building MSL and floor-relative values unchanged. Introduce explicit `specified`/`unspecified` shared elevation values and conversion adapters only after owner supplies a vertical reference. Do not coerce missing to zero. |
| Feature behavior | Buildings: keep base/structure authoritative, but foundation operator inactive until a campus-datum foundation elevation is explicitly known. Ground floor: derived from building base plus its existing relative floor elevation only when building base has a known conversion. Upper floors remain relative to building and are not terrain draped. Roads/walkways/ramps/bridges/entrances/navigation nodes: add explicit campus-datum elevation or explicit unspecified state; connectors represent transitions. Do not auto-drape route nodes or infer bridge/ramp gradients from terrain. |
| Blocker | **Yes for automatic excavation and shared Z comparisons.** Owner must provide the campus vertical datum name/zero reference and, for any building, a trusted campus-datum foundation/base value or a validated conversion from the exact MSL datum represented by current values. “Above sea level” alone is not a specified geodetic vertical datum. |
| Reversibility | Difficult once mixed vertical values are persisted or published. |
| Alternatives | Keep separate references indefinitely (safe but no automatic terrain/building alignment), or migrate all entities through explicit conversion (only with survey/vertical transformation evidence). |
| Owner response |  |

## 4. Resolution and limits

### E9-04 — Provisional grid and benchmark cap

| Field | Recommendation |
|---|---|
| Why it matters | Coarse cells cannot express narrow paths/ramps/entrances; fine grids increase history, IndexedDB, database, transport and rendering cost. |
| Provisional choice | 5 m authoring grid; 128×128 tiles; 10 m overview LOD. These are test defaults, not measured requirements. 5 m can represent broad campus grading but is not sufficient to author narrow walkways, accessible ramps, entrance thresholds, curbs or small features. Those require separate vector/structure geometry or later finer terrain. |
| Initial synthetic safety cap | Until measured, cap the initial synthetic fixture at 50,000 valid grid cells and 1 MiB canonical serialized terrain scope; refuse oversize allocation/save before document mutation. Use a 16 MiB ceiling for one undo command/history delta as a provisional guard, not a browser-tested limit. These caps are proposed safety limits, not benchmarks or production capacity claims. |
| Campus extent | No general maximum is supported by current evidence. A 1 km × 1 km, 5 m fixture (~40,401 edge-inclusive samples) fits the proposed synthetic cell cap; this is a test envelope only, not approved campus coverage. |
| Precision | Float32 is the recommended first encoding for straightforward editing. Its acceptable precision depends on elevation range and vertical requirements, which must be supplied; keep a format version and test range. Consider quantized integer only after an explicit error bound. |
| Reversibility | Spacing/caps are moderate to change while synthetic-only; difficult after real grid data/import/public artifact adoption. |
| Owner response |  |

**Benchmark matrix:** 0.25/1/4 km²; 10/5/2 m; sparse/dense strokes; desktop and target mobile; cold/warm load; preview p50/p95; affected samples/tiles; command memory; undo/redo; IndexedDB size/save/recovery; scoped payload and save p50/p95; PostgreSQL WAL/checkpoint growth; checksum/reconstruction; GPU memory/frame rate.

**Provisional acceptance gates for a synthetic development target (owner to confirm):** no input >50,000 cells or >1 MiB serialized scope; no pointer-move DB writes; preview p95 ≤50 ms on named reference hardware; one undo command ≤16 MiB; local-draft recovery ≤2 s for max fixture; explicit-save p95 ≤1 s for max fixture on local E5; no partial commits; all counts/checksums exact. These are proposed targets, not observed performance. Revisit after baseline measurement.

## 5. Brush and lasso

### E9-05 — Editing behavior and controls

| Field | Recommendation |
|---|---|
| Operations | Raise, Lower, Smooth, Flatten-to-captured target. Circular default; ellipse/square/triangle presets and custom silhouette editor. Controls: diameter in meters, strength, falloff, rotation. |
| Custom shape | Custom brush points describe a local 2D normalized mask, not campus geometry. Save as user/editor preference, version its rasterization, and use the same deterministic kernel in preview/commit. Avoid freeform control-point elevation constraints in v1. |
| Lasso | Freehand and polygon selection; adjustable feather in meters; selection remains temporary and separate from persistent lock mask. Shift adds, Alt subtracts, Ctrl/Command intersects only while lasso mode is active, with visible mode hints. |
| Modifiers | Do not use global `B` (currently Building). In contextual terrain mode only: `[`/`]` adjusts size; `Shift`+`[`/`]` adjusts strength; Alt-drag rotates non-circular shape when the pointer begins on a visible rotation handle. Keep controls available in UI and avoid overriding browser/editor shortcuts. |
| Commit | Preview buffer updates continuously; pointer-up creates one reversible command. Escape/pointercancel cancels. Undo/redo local. No DB writes until explicit Save. |
| Reversibility | Easy/moderate for controls; changing kernel/rasterizer later requires versioned command replay/serialization tests. |
| Owner response |  |

Defaults are safe to use for Phase 2 after the grid data contract is approved. Shortcut bindings may be deferred to usability testing.

## 6. Locks and conflicts

### E9-06 — Protection behavior

| Field | Recommendation |
|---|---|
| Locks | Persist a per-sample lock bitmask in each tile for deterministic brush behavior; offer region painting as a UI convenience rasterized to the mask. Store selection separately and temporarily. |
| Visual/history | Patterned lock overlay; lock/unlock produces one reversible terrain command. Locked sample brush weight is zero and is included in changed-sample counts as skipped. |
| Excavation | Locked samples block derived operators. No default override. If override is later approved, it must be explicit, previewed and auditable; do not erase lock state. |
| Overlap | Incompatible building foundation surfaces/margins cause a blocking conflict. No silent merge or last-writer-wins. Equal elevations may compose only if deterministic operator ordering is unnecessary; verify at implementation. |
| Reversibility | Moderate; policy can evolve before real data, but lock schema changes need versioning. |
| Owner response |  |

## 7. Building foundations and excavation

### E9-07 — Derived non-destructive operators

Recommended pipeline: `authored grid → manual edits → deterministic building foundation/excavation operators → effective surface/mesh`. Building position and elevation stay authoritative. Operator stores building ID, footprint revision, campus-datum foundation elevation, configurable margin/falloff and algorithm version. Under footprint, show a flat foundation plane; hide/clip terrain mesh within building footprint so terrain cannot appear through the building/interior floors. Outside footprint, blend to base surface. Support cut and fill as derived estimates, never destructive edits.

Moving/removing a building recomputes/removes its operator and reveals untouched authored terrain. Disjoint buildings compose. Conflicting overlaps and locked-region intersections block and show actionable resolution. Unknown foundation elevation disables the operator.

**Blocker:** requires E9-03 datum/conversion data and owner approval on margin defaults and overlap behavior. The audit cannot establish building heights or survey alignment.

| Alternatives | Reversibility | Owner response |
|---|---|---|
| Derived operators (recommended); destructively flatten grid (reject: loses authored values); no excavation (safe fallback until datum resolved) | Derived path is moderate; destructive rewrite is difficult/unsafe |  |

## 8. Renderer

### E9-08 — Live 3D preview

| Field | Recommendation |
|---|---|
| Existing | MapLibre is present and E8.5 renders 2D terrain polygons. MapLibre raster DEM requires a raster source; custom WebGL adds lifecycle complexity. No Three.js/R3F package was found installed. |
| Recommendation | Keep the main map 2D; use an isolated Three.js canvas as a candidate smaller live preview after separate dependency approval. Indexed mesh supports orbit/rotate/zoom/pan, dirty tile updates, wireframe, lock/selection overlay and foundation/excavation preview. Dispose resources, handle context loss and maintain 2D fallback. |
| Alternatives | MapLibre DEM: strong if a tile pipeline is adopted; R3F: React convenience but extra dependencies; custom WebGL: more control, higher maintenance. |
| Reversibility | Moderate before public artifacts; dependency is removable but renderer-specific behavior can become coupled. |
| Owner response |  |

No packages/prototype are authorized by this decision sheet. Renderer can be deferred until Phase 6.

## 9. Persistence

### E9-09 — One terrain scope initially

| Field | Recommendation |
|---|---|
| Recommendation | Keep one `terrain:<campusId>` scope initially with tile encoding inside it. Explicit Save only; no DB writes during pointer movement. One stroke is one local command; IndexedDB retains draft after failure; durable success requires verified exact acknowledgment. Terrain-only save must leave building/routing/settings scopes unchanged. |
| Why initially | Existing scope and atomic transaction are implemented; adding per-tile server revisions immediately creates manifest/atomic consistency complexity. |
| Split threshold | Start tile-revision design if max-fixture canonical scope exceeds 1 MiB, local E5 explicit-save p95 exceeds 1 s, local fresh-context reconstruction exceeds 2 s, or expected campus coverage exceeds 50,000 samples. These are proposed gates, not measured findings. Require all writes/read manifests to expose one complete terrain revision. |
| Reversibility | Moderate before real data; difficult after revision history depends on scope layout. |
| Owner response |  |

## 10. Publishing and runtime

### E9-10 — Versioned optional artifacts

**Save** persists authored campus data. **Publish** compiles the saved data into a runtime bundle. Keep that distinction.

Recommend optional versioned grid metadata and checksummed tiles as the canonical terrain artifact plus deterministic derived runtime LOD/mesh with generator version/source checksum. Build a complete immutable manifest first; atomically advance public pointer only after all artifacts validate. Preserve `terrainAreas` and legacy polygon rendering. Terrain-free and polygon-only clients/bundles must keep working. Version negotiation must choose supported artifact or render current polygons/2D fallback; reject corrupt/missing tiles explicitly, never present a silently flat surface.

Reversibility is moderate with optional versioned fields and difficult after clients rely on a format. Defer publish-format implementation until Phase 7. Owner input required on client support window and whether published bundles include source grid tiles, derived mesh/LOD, or both (recommended: both versioned, with older clients ignoring unknown optional fields).

| Owner response | |
|---|---|

## Genuine blockers vs safely deferrable details

**Block before Phase 1 data-contract freeze:** campus horizontal origin/CRS/reference (E9-02); terrain datum name/zero and no-data/units semantics (E9-03/04); approve one grid authority and provisional sample/payload cap (E9-01/04). A synthetic fake local coordinate fixture is okay for tests but does not settle real campus reference.

**Block before excavation:** verified vertical reference/conversion or owner-provided building foundation elevations; conflict policy and margins (E9-03/06/07).

**Can defer:** exact brush keyboard shortcuts, custom brush UI polish, Three.js choice until Phase 6, publish client window until Phase 7, final production performance caps until benchmark. Use safe provisional defaults and keep features isolated.
