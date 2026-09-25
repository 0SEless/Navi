# 360 Tour — Phase 3: Data Contract + Verifier Hardening

**Date:** 2026-09-25
**Branch:** navi-next `master` @ `048fb6b` (no commits made this phase)
**Status:** COMPLETE — all 5 tasks executed, all gates PASS, no new failures

---

## Status

| Task | Description | Gate | Result |
|------|-------------|------|--------|
| T1 | Fix `round-trip-verifier.ts` `parsed['building']` → `buildings` contract + focused regression tests | A | PASS — publisher 110/110 (red-check: 3 failed on old code) |
| T2 | `?? null` optional-artifact contract: route emission + runtime loader tolerance + consumer null-safety | B | PASS — route 2/2, loader 2/2, explore-contracts 7/7 |
| T3 | Panorama/hotspot round trip: input → build → serialized package file → runtime load | C | PASS — 3/3 (full real pipeline, no mocks) |
| T4 | Read-only dataset/profile ownership investigation (`Campus → Building → Floor → Scene`) | D | Findings below (no code changes) |
| T5 | Post-change regression re-run vs baseline; new vs pre-existing failures distinguished | E | PASS — no new failures; lint 0 errors on changed files |

## Scope

Modified (only as permitted):
- `packages/publisher/src/round-trip-verifier.ts` — one-key contract correction (+comment)
- `packages/publisher/src/__tests__/round-trip-verifier.test.ts` — fixture key correction + 2 focused regression tests
- `src/lib/__tests__/explore-contracts.test.ts` — 1 added `null` assertion (file was git-clean)

New test files:
- `src/app/api/publish/__tests__/optional-null-artifacts.test.ts` (T2, 2 tests)
- `packages/runtime/src/loader/__tests__/optional-null-artifacts.test.ts` (T2, 2 tests)
- `src/__tests__/panorama-hotspot-roundtrip.test.ts` (T3, 3 tests)

Documented, NOT fixed (out of scope): `publisher.test.ts:223` vacuous `['building','search']` loop (see Verifier Findings).

---

## Verifier Findings (T1)

**The bug:** `round-trip-verifier.ts:58` read `parsed['building']`. The verifier's `parsed` map is
keyed by `manifest.artifacts` entry names, and published packages key that artifact `buildings`
(`ARTIFACT_NAMES` in `publisher.ts:19`; live-gate manifest observed with keys
`buildings, floorGeometry, graph, panorama, poi, qrIndex, search, spatial`). So
`parsed['building']` was **always `undefined` in production** — the entrance-integrity block
(L59-68) never executed against real packages: a dead correctness path that Phase 1 had flagged.

**The fix:** `parsed['building']` → `parsed['buildings']`, with an explanatory comment. No alias
introduced (per instruction: a legacy `building` key is an unrecognized artifact and gets
checksum-only treatment).

**Tests:**
- Existing fixture corrected: manifest key `building`/`building.json` → `buildings`/`buildings.json`
  (5 `writeWithChecksum` call sites updated). The existing "reports entrance references to unknown
  nodes" test now genuinely exercises the (fixed) path.
- New focused regression pair (both proven RED on old code, GREEN after fix — red-check run
  showed `3 failed | 9 passed`):
  1. `runs entrance-integrity against the published buildings key` — correct-key package with a
     broken entrance must be reported (`Building b1 entrance bad-ent ... no-such-node`);
     asserts no legacy `building` key exists in the fixture.
  2. `does not fall back to the legacy building key (no alias)` — package keyed only `building`
     with the same broken entrance must NOT produce an entrance error (checksum-only) and passes.
- Verification: publisher suite **110/110** after fix (baseline 108 + 2 new).

**Cross-check:** fixed verifier now runs entrance-integrity during `Publisher.publish()`
verification against real fixtures — all publisher publish tests still green (Gate A), so no
real package violates the newly-live check.

**Related finding (documented, not fixed — out of scope):** `publisher.test.ts:223`
`for (const name of ['building','search'])` — `aMap.get('building')` returns `undefined` for both
loop iterations, so the assertions are vacuous (`undefined === undefined`). Same wrong-key family
as the verifier bug; belongs to a future cleanup, explicitly not touched here.

---

## Null Artifact Contract (T2)

**Intent: DELIBERATE / intentional.** Evidence:
- `route.ts:195-198` blob: `spatialIndex/panoramaIndex/floorGeometry/qrIndex ?? null` (explicit);
- `route.ts:284-290` demo-output files: **7 optional files** written as `JSON.stringify(x ?? null,
  null, 2)` → exact 4-byte string `'null'` when absent;
- `route.ts:311-320` manifest: lists ALL entries, checksums computed over the exact written bytes
  (ERRORS.md 2026-07-08 note preserved);
- Phase 1 documented the explicit `?? null` as deliberate; runtime consumers are null-tolerant
  (`getAvailablePanoramas` uses `panoramaIndex?.panoramas ?? []`).

**Two representations exist and both are valid:**
1. **API-route packages** (`demo-output`): absent optional artifacts are LISTED with literal
   `'null'` content + checksum over those bytes.
2. **`@navi/publisher` packages**: `writeArtifacts` skips falsy artifacts (`if (!data) continue`)
   → absent artifacts are OMITTED from the manifest entirely.

**Contract (now explicitly tested):** both representations converge — package loads successfully,
real artifacts hydrate, absent/null optional artifacts bind to `undefined`. `null` is an absence
marker, never package corruption. Differences are only in per-artifact reports (see below).

**Tests added:**
- `optional-null-artifacts.test.ts` (route, 2 tests):
  - absent case: blob carries explicit `null`s for the 4 nullable slots while
    search/building/poi get default empty objects; all 7 demo-output files are exactly `'null'`;
    manifest lists all 8 keys with `sha256('null')`/size-4 checksums (graph checksum matches its
    real bytes);
  - present case: provided `spatialIndex`/`panoramaIndex` are written as real documents (never
    nulled), their manifest checksums match the serialized content; still-absent slots remain
    `'null'`.
- `packages/runtime/src/loader/__tests__/optional-null-artifacts.test.ts` (2 tests):
  - route-style package (null documents listed): `load()` **succeeds**; graph hydrates; all null
    optional artifacts bind `undefined` and report `FAILED`/`INVALID_SCHEMA` (accurate per-artifact
    signal, does not poison the package); unknown key `spatial` reports `SKIPPED`;
  - publisher-style package (absents omitted): identical package-level outcome; reports contain
    only the graph entry. The two representations converge on bindings; they differ only in
    reporting.
- `explore-contracts.test.ts`: added assertion that `getAvailablePanoramas` also tolerates an
  explicit `null` (not just `undefined`) — this is the shape the route actually persists.

**Contract nuance found (type-level, runtime-safe):** `CampusBundle.panoramaIndex` is typed
`PanoramaIndex | undefined` (not nullable), and `public-store.ts:803` passes route-null through a
type-only `as PanoramaIndex | undefined` cast. Runtime values can therefore be `null` despite the
type; all consumers checked are null-safe via `?.`/`??`. Documented here; type widening deferred.

---

## Panorama-Hotspot Contract (T3)

New `src/__tests__/panorama-hotspot-roundtrip.test.ts` — three legs over the **real pipeline**
(`Publisher.publish()` with real EnvironmentProbe/serializer/checksum/RoundTripVerifier/
RenameCommitter, zero mocks), then runtime `load()`:

1. **build leg** — `buildPanoramaFile` preserves `id, type, target, yaw, pitch, label`,
   plus `hotspotType` and `content` when supplied; navigation hotspot has `content: undefined`,
   information hotspot keeps `content {title, description, linkUrl}`; nav vs info distinguishable
   by both `type` and `hotspotType`.
2. **serialized leg** — `panorama.json` inside the published package is byte-faithful
   (`JSON.parse` deep-equals the authored contract); manifest lists it under key `panorama` with
   checksum matching the file bytes (also exercises the FIXED RoundTripVerifier end-to-end on a
   real `buildings`-keyed package).
3. **load leg** — runtime hydration yields the same panorama entry (position flattened back to
   `{lat,lng}`, heading/floor/imageAssetId intact), hotspots unchanged including `hotspotType` +
   `content`; `reports` shows panorama `LOADED`.

Result: 3/3 PASS. (Converter mapping `toHotspot` at `runtime-converter.ts:184-194` confirmed to
carry `hotspotType`/`content` — matching the Phase 2/gate behavior.)

---

## Dataset-Profile Ownership Findings (T4 — read-only)

**Relationship map:**

```
AUTHORED (source of truth — Studio)
  CampusDocument (core/types/document.ts:61)
    ├─ buildings: Building[] (entities.ts:30)      ← campus OWNS buildings (composition)
    │    └─ floors: Floor[] (entities.ts:49/71)    ← building OWNS floors
    │         └─ rooms/hallways/walls/pois/entrances/roomAttributes…
    │                                       ← floor OWNS interior entities
    ├─ roads, panoramas[], qrCheckpoints[], pois? (outdoor), areas?, boundary…
  Owner: editor document context; persisted as graph_snapshots.data (GraphSnapshot).
  Integrity rules exist in campus-backup/validate.ts (dangling-door-floor, dangling-component-building…).

"DATASET" (backup UX)
  /dataset page → services/campus-backup/{export,import,validate}.ts
  Lossless envelope `navi-campus-backup/v1` = { graph: GraphSnapshot, campusMap? }.
  Owner: pure-data module (explicitly no DB/network inside). Maps 1:1 to authored document.

PUBLISHED (derived, revisioned)
  publish pipeline → Supabase published_maps.artifacts (primary) + demo-output backup
  Owner: server; immutable per revision (monotonic write via writePublishedMap).

RUNTIME READ MODEL (client)
  public-store.fetchFromPublicCampus → CampusBundle (nav-types.ts:172)
    ├─ buildings: nav-types Building { floors: number[] }   ← FLOOR LEVELS ONLY (no Floor entity)
    ├─ floorGeometry?: FloorGeometryArtifact                ← published floor polygons/anchors
    ├─ components?: Component[] (rooms etc.), doors?, poi?, traces?
    └─ panoramaIndex?, qrIndex?, searchEntries…
  Owner: usePublicStore — campus slice + preferences slice + UI state
         (indoorContext {buildingId, floorId}, activeFloor, revealedPoiIds, selectedBuildingId).

SCENE (render projection — NOT a domain entity)
  PersistentCampusScene.tsx:59 — "Owns the common campus scene for the lazy MapLibre runtime".
  SceneDataSnapshot = { bundle, mapAppearance, selectedBuildingId, activeFloor, indoorContext,
                        revealedPoiIds } → cached NavigationRenderModel → layers.
  Owner: component + store UI state. Pure derived projection; zero data ownership.
  (No `Scene` interface exists in @navi/core; graphify "Scene" resolves to vendored pannellum.js.)

"PROFILE"
  /map/profile → ProfileDashboard — USER profile: preferences (theme/navigation/accessibility via
  public-store `preferences`/loadPublicPreferences) + favorites (localStorage `navi-favorites`)
  + auth session. Client-owned; server stores nothing.
  Distinct concept: editor validation profiles (packages/editor/src/validation/profiles.ts) —
  rendering/validation profiles. Same word, unrelated domains.
```

**Existing reusable ownership:** authored `Campus → Building → Floor` composition is solid,
versioned (schemaVersion + connectivitySemanticsVersion), and backup-validated. The published
side already re-expresses floors via `BuildingIndexFile.floors` (level/label/elevation/nodeIds)
+ `floorGeometry` artifact; the render Scene is cleanly derived with no ownership conflicts.

**Missing links / gaps:**
1. **No Floor entity in the runtime bundle** — `CampusBundle.building.floors` is `number[]`.
   Floor labels/elevation survive via the published `buildings` artifact entries, but authored
   floor metadata (`planImageId`, `planAlignment`, `offset`, `rotation`, `visible`, `locked`)
   is not published. Deliberate-looking (editor-only concerns) but never stated as an explicit
   contract.
2. **Panoramas are not nested under Floor/Building** — flat `CampusDocument.panoramas[]` with
   `buildingId` + `floor` fields, filtered at consumption (`getAvailablePanoramas`). Works today.
3. **Two concepts each for "profile" and "dataset"** (user profile vs editor validation profiles;
   campus-backup dataset vs legacy `DatasetManagement.tsx` screen) — ambiguity risk in tickets.
4. **`CampusBundle` name collision** — app-level `Building`/`CampusBundle` ≠ core entity types.
5. **graphify query caveat:** knowledge graph contains archive-copy communities
   (`.stage1.*-worktree/`) — queries can return archived paths; path CampusDocument→Scene not found
   (Scene genuinely not a data concept).

**Small future extension (if ever needed):** none required now. If floor-level authored metadata
becomes a public need, extend `BuildingIndexFile.floor` entries (already carries
level/label/elevation/nodeIds) additively — do NOT introduce a new artifact or nest panoramas
under Floor (would break the flat additive public contract). If "Scene" is ever to become a
domain concept (e.g., 360 scene per floor), model it as a new optional artifact referencing
`buildingId + floor`, not as ownership nesting.

**Risks/ambiguities:** type-only `as` casts in public-store (T2 finding); unpublished floor
metadata could surprise contributors expecting floor plans on the public map; "profile"/"dataset"
vocabulary collisions.

---

## Tests

**Baseline (pre-edit) → Post-change:**

| Suite | Baseline | Post-change | Delta |
|-------|----------|-------------|-------|
| publisher (full pkg) | 108/108 pass | **110/110 pass** | +2 T1 regression tests |
| runtime `src/loader` | 67/67 pass | 69 (in full run) | +2 T2 loader tests |
| runtime (full pkg, wider scope this phase) | not baselined | 436 tests pass / 43 files; 1 file fails transform (pre-existing, below) | new scope |
| core (full pkg) | 348/348 pass | **348/348 pass** | unchanged |
| root publish-route tests | 18/18 pass | **20/20 pass** | +2 T2 route tests |
| root explore-contracts | 7/7 pass | **7/7 pass** | +1 null assertion (file was clean) |
| panorama-hotspot-roundtrip (new) | — | **3/3 pass** | T3 |

**Gates executed:** A (publisher 110/110 + red-check `3 failed` on reverted fix) → B (T2 11/11
across three files) → C (T3 3/3) → D (T4 findings) → E (regression re-run above).
**Lint (changed files only):** `npx eslint` on all 6 touched/new files → **0 errors, 0 warnings**
(initially 1 warning — unused `deserialize` import — fixed and re-verified).

---

## Pre-existing Failures (not caused by Phase 3, not fixed per scope)

1. `packages/runtime/src/__tests__/data-identity-comparison.test.ts` — **parse error** (unclosed
   arrow-function brace opened at L39, expected `}` at EOF/L255) → file fails to transform, 0 tests
   run from it. **Proof of pre-existence:** file is git-CLEAN (empty `git status --porcelain`),
   last committed in `4ca9d98 stabilize: packages/runtime` — Phase 3 never touched it; full-runtime
   scope was simply never run in this phase's baseline (baseline covered `src/loader` only).
2. Known from earlier phases (documented in ERRORS.md, not re-run this phase):
   `routing-runtime-validation.test.ts` failures, Navigate dev-simulator assertion, full-`tsc`
   TS1005, stale lint baselines.

## Deferred Work

- `publisher.test.ts:223` vacuous `['building','search']` loop (same wrong-key family as T1 bug).
- Type widening: `CampusBundle.panoramaIndex`/`floorGeometry`/`qrIndex` to include `| null`
  (runtime reality via route `?? null` + public-store `as` casts).
- Explicit documentation of unpublished authored floor metadata (plan images/alignment etc.).
- Fix of pre-existing `data-identity-comparison.test.ts` parse error (runtime package).
- T4 "small future extension" items — intentionally deferred, none required now.

## Conclusion

All five Phase 3 tasks completed and verified with evidence: the dead `building` verifier path is
fixed and pinned by red-checked regression tests; the `?? null` optional-artifact contract is
determined deliberate and explicitly tested at all three layers (route emission, runtime loader
tolerance, app consumer); panorama/hotspot field fidelity (including `hotspotType`/`content` and
nav-vs-info distinction) is pinned across the full build→package→load round trip; dataset/profile
ownership was mapped read-only with a clear relationship diagram, gaps, and a bounded future
extension path. Regression re-run shows **zero new failures**; navi-next tree delta reconciles
exactly to the permitted edits (M 110→113, ?? 346→349, D 2, HEAD `048fb6b` unchanged); parent repo
untouched (28/6102/58 @ `33287ef`). No commits made, per constraints.
