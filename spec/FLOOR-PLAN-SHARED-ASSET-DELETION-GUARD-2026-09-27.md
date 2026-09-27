# SPEC: Floor-Plan Shared-Asset Deletion Guard (2026-09-27)

## Problem

Floor-plan **bindings** are correctly per-floor (Bug A fix, already verified):
each floor resolves its image through `resolveFloorPlanUrl(floorPlanUrls[level],
floorData)` with the floor's own `planImageId` as primary source. But physical
**storage cleanup** is not reference-aware:

```text
GF → floor-0-A.png
1F → floor-0-A.png
2F → floor-0-A.png

replace GF → B        (binding update is correct: GF=B, 1F=A, 2F=A)
delete old asset A    ← FloorEditor calls deleteFloorPlanImage(A, scope{level:0})
isOwnedFloorPlanUrl(A, scope) → true   (path prefix floor-0- matches)
→ A is physically deleted
→ 1F and 2F still resolve A → BROKEN IMAGES
```

The prefix-ownership check (`floor-plan-storage.ts`) proves the file belongs to
the *performing* floor's storage namespace; it says nothing about whether other
floors still reference the same file.

## What (invariant)

> **A floor-plan asset may only be physically deleted when no authoritative
> floor-plan reference resolves to that asset.**

Reference existence takes precedence over storage-path ownership.

## Reference set (from Phase 0 audit — all `path:line` verified)

Collected from the `building` prop available at both deletion call sites:

| Source | Field | Status |
|---|---|---|
| Per-floor binding (primary) | `building.floorData[].planImageId` | authoritative — read path `FloorEditor.tsx:123` |
| Legacy fallback (read-only) | `building.floorPlanUrls[level]` | authoritative — same resolver, `floor-plan-lifecycle.ts:27` |
| Published visuals | `building.floorPlanVisuals[level].imageUrl` | live reader `PublicMap.tsx:285` |
| Building-level legacy | `building.floorPlanUrl` (singular) | **no reader anywhere** (grep: src+packages+apps) → excluded, documented below |
| Floor level list | `building.floors[]` ∪ `floorData[].level` | iteration domain |

A floor `F` **references** URL `U` iff
`resolveFloorPlanUrl(floorPlanUrls[F.level], { planImageId: F.planImageId }) === U`
— i.e. exactly what the renderer would display. This is resolver-based, so:

- explicit `planImageId: null` (remove) shadows the legacy fallback → floor no
  longer references the legacy URL (intentional-removal semantics preserved);
- a floor with no/undefined `planImageId` falls back to `floorPlanUrls[level]`
  → legacy references are protected (Test 4);
- `floorPlanUrls` is **never written** by this guard or by replace/remove
  (legacy stays read-only compatibility data).

**Staleness:** both call sites run immediately after a successful
`entity.update` inside the same callback; the captured `building` prop still
holds the *pre-update* binding for the edited floor. The collector therefore
takes an `updatedFloor { level, planImageId }` override (replace → new URL,
remove → `null`) so the edited floor's stale value is never counted and its
post-update resolution provably cannot be the asset being deleted.

**Scoping:** storage assets live at
`floor-plans/{mapId}/{buildingId}/floor-{level}-*` — the path is
building-scoped, and `isOwnedFloorPlanUrl` already restricts deletion to the
edited building's namespace. The reference domain is therefore the edited
building's floors plus its persisted visual record; FloorEditor has no campus
wide runtime model at the call site, and a cross-building pointer into another
building's storage path would be corrupt data (documented residual risk).

**Excluded — `building.floorPlanUrl` (singular):** grep-verified to have zero
readers in `src/`, `packages/`, `apps/` (only db row mapping
`db-schema.ts:80` and snapshot roundtrip `graph-snapshot-serializer.ts:168`).
It is inert persisted data; counting it would permanently block cleanup of
replaced assets on every legacy building that carries it. If a reader ever
appears, the collector must be extended (noted in code comment).

## Behavior

```text
request deletion of asset A
        ↓
collect authoritative floor references (post-update state)
        ↓
A ∈ referencedUrls?
      /        \
   YES          NO
    ↓            ↓
 return       existing prefix-ownership check → physical delete
(safe, no error — shared-asset use is expected, not exceptional)
```

The reference check runs **before** the ownership check inside
`deleteFloorPlanImage` (reference existence takes precedence over path
ownership). Backward compatible: the new parameter is optional; calls without
it behave exactly as today (existing storage tests must stay green).

## Not changing (Phase D boundary)

- Per-floor binding architecture (Bug A fix) — untouched.
- `FLOOR_PRESENTATION_DATUM`, wall extrusion, `Floor.elevation`, 2.5D raster
  suppression, published stacking (Bug B) — untouched.
- Floor-plan storage layout, upload path, alignment/replace policy — untouched.
- No reference-counting infrastructure, no migration, no UI change.

## Success criteria

1. Shared asset survives replacement from any floor (Tests 1, 3).
2. Unreferenced asset is still deleted (Test 2) — cleanup not blocked.
3. Legacy `floorPlanUrls[level]` references prevent deletion (Test 4).
4. Real production update path (`entity.update` dispatch) + real guard
   exercised together: binding changes AND old shared asset preserved
   (Test 5).
5. Existing suites green: `floor-plan-lifecycle`, `floor-plan-map-source`,
   `floor-plan-commit`, `floor-plan-storage`, floor-switch canvas tests.
6. Zero new TypeScript/ESLint errors.

## Known pitfalls (ERRORS.md)

- Never key floor-plan lookups by array index — `floorPlanUrls` is keyed by
  level (2026-09-27 index-vs-level bug).
- Never re-resolve a value already passed as a prop (Bug A T1 lesson).
- PowerShell: pipe, never `<` redirection.
- Write spec/plan to per-feature files, never the shared SPEC.md/PLAN.md.
