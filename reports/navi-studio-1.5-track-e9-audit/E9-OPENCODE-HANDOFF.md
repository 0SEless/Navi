# OpenCode Handoff — NAVI Studio 1.5 E9 Continuous Terrain

## Handoff status

This is preparation only. **Do not implement until the project owner explicitly approves the Phase 1 data contract and implementation scope.** The E9 audit is complete and its findings are recorded in reports 00–14. This handoff references them rather than repeating the audit.

## Existing project and Git state (verified 2026-10-30)

- Worktree: `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027`
- Branch: `codex/navi-studio-1.5-track-a-20261027`
- HEAD: `bead5101fc853959f99f7aabcdba72423f48f839`
- Git status: extensively dirty, with modified tracked files, deletions and untracked files including `.tmp-vitest/`, `demo-output/`, reports, E8 plans/specs and test artifacts. Do not reset, clean, checkout, stash, stage, commit or overwrite pre-existing work. Recheck branch/HEAD/status when implementation is approved; do not assume this captured status remains current.
- Do not initialize, clone, recreate, or create another worktree. Continue in this exact worktree.

## Existing E8.5 baseline

Implemented baseline: campus-level terrain polygons with stable IDs; shared authored campus-local datum; reversible commands/history/undo-redo; explicit scoped save; IndexedDB draft/recovery; compiler and published-bundle propagation; public MapLibre 2D polygon visualization; legacy terrain-free compatibility.

Not implemented: continuous height grid; brush/lasso editing; terrain locks; building foundation/excavation; continuous mesh; live 3D terrain preview. Do not claim otherwise. See audit report 01 and E8.4/E8.5 evidence referenced in report 14.

## Findings and proposed architecture

Read all reports 00–14 in `reports/navi-studio-1.5-track-e9-audit/` before work. Key paths include:

- Core data/coordinates: `packages/core/src/types/document.ts`, `packages/core/src/types/entities.ts`, `packages/core/src/types/coordinates.ts`, `packages/core/src/coordinates/transformer.ts`, `packages/core/src/geometry/terrain-polygon.ts`.
- Editor command/history: `packages/editor/src/commands/terrain-area-handlers.ts`, command registry/index, `packages/editor/src/context/document-store.ts`, `packages/editor/src/history.ts`.
- Studio: `src/components/studio/TerrainAreaAuthoring.tsx`, `StudioCanvas.tsx`, `StudioWorkspace.tsx`, `ToolDock.tsx`, `InteractionController.tsx`.
- Persistence: `src/services/scoped-change-detection.ts`, `scoped-save-document-session.ts`, `scoped-campus-save.ts`, `scoped-postgres-adapter.ts`, `scoped-campus-snapshot.ts`, `src/services/studio-local-drafts.ts`, `src/store/graph-store.ts`.
- Compiler/runtime: `packages/compiler/src/emitter/artifacts.ts`, compiler validation/types, `src/app/api/publish/route.ts`, `src/components/map/layers/TerrainLayer.tsx`, `src/components/public/ExploreMap.tsx`, public bundle types.

Proposed model: one versioned regular height grid, tiled for bounded allocation/update/checksum. Float32 plus explicit no-data bit mask is a provisional encoding. Tiles have stable row/column order and deterministic checksums. Existing E8 polygons remain independent; no second writable elevation authority. Use a campus-projected meter coordinate service at the existing transform boundary. Brush pointer movement changes private preview buffers; one pointer-up produces one reversible tile-delta command. One terrain scope and explicit Save remain initially; IndexedDB draft/recovery remains available; no per-pointer DB writes. Excavation is a reversible derived operator over untouched authored terrain. Published mesh is derived and versioned; old polygon/terrain-free bundles remain compatible.

See decision sheet `E9-OWNER-DECISIONS.md`. Recommendations are not approvals. In particular, real-campus projected CRS/origin and vertical datum/conversion are unresolved blockers for a real grid contract and any automatic excavation. Do not infer a CRS, survey accuracy, or MSL conversion.

## Approved requirements vs proposed defaults

**Approved by this handoff/spec baseline:** preserve all dirty work; E8 polygon behavior; campus-level placement; explicit Save; one command per completed stroke; no database writes while pointer moves; keep local drafts on failures; terrain-only scope changes; no silent conflict resolution; no production/cloud/real campus writes.

**Proposals awaiting owner approval:** tiled regular-grid canonical model; tile size 128×128; 5 m spacing; Float32; no-data mask; 50,000-cell/1 MiB synthetic caps; projected CRS/origin; vertical datum contract; Three.js preview; detailed shortcut modifiers; excavation rules; publisher artifact/version contract and performance thresholds. Never label these approved until an owner response is recorded.

## Phase sequence and gates

Every phase must stay narrow, use synthetic fixtures, add focused tests, preserve existing dirty state, and stop at its gate for owner review. No unrelated refactor.

| Phase | Scope / dependencies | Likely modules | Required evidence and approval gate | Rollback |
|---|---|---|---|---|
| 0. Contract | Owner decisions for CRS, datum, grid/limits, no-data, caps; no code | This decision sheet; design notes only | Owner records decisions; no unresolved real-coordinate assumptions. Gate: explicit approval | Edit docs only |
| 1. Core grid | Data contract only; no editor, DB, browser renderer, compiler runtime, or dependencies | `packages/core/src/types/`; new core terrain-grid module; core serialization/validation exports/tests | Unit + serialization/round-trip + malformed/version/checksum/bounds tests; deterministic golden bytes; bounded allocation tests; legacy E8 document equivalence. Acceptance detailed below. Gate: owner reviews schema before Phase 2 | New optional versioned type remains unused; existing document/polygon behavior unchanged |
| 2. Edit engine | Approved grid API; private preview and command model | `packages/editor` command/history; new terrain edit-session modules; Studio canvas integration later | Unit brush/lasso/lock kernels, pointer cancellation, one command/stroke, exact undo/redo; focused browser gesture tests. Gate: owner approves editing interaction | Disable new terrain mode; leave grid data intact |
| 3. Persistence | Phase 1/2; E5 only if separately authorized | scoped projections/session/snapshot, local draft; API only if necessary | Synthetic E5 receipt/checksum, no unrelated scopes, stale/network recovery, fresh context, no pointer writes. Gate: owner reviews evidence | Keep flag off; do not migrate/drop existing scope |
| 4. Performance | Grid/editor/persistence acceptance | core/editor/storage diagnostics and benchmark fixtures | Matrix in owner sheet; sample, payload, memory, p50/p95, recovery, WAL and frame budgets. Gate: owner sets final caps | Reject unsupported sizes; do not silently downsample |
| 5. Foundations | Explicit vertical conversion/data first | core elevation types, derived operator module, building preview UI | Cut/fill, lock/overlap conflicts, movement/remove restoration and no interior terrain; synthetic tests. Gate: explicit owner approval of foundation rules | Disable derived operators; retain base grid |
| 6. 3D preview | Approved renderer/dependency and performance target | isolated preview component, mesh builder, resource lifecycle | Orbit/pan/zoom, live dirty updates, wireframe, lock/foundation visualization, context-loss/fallback browser tests. Gate: owner approves dependency and preview | Remove preview mount; keep 2D editor/data |
| 7. Publish/runtime | Versioned artifact design, compatibility matrix | compiler artifact/types/validator, publish service, public runtime layers | Atomic manifest/checksum, old polygon and terrain-free bundles, corrupt/missing tile behavior, fallback, synthetic browser publish/read. Gate: separate publish/release approval | Continue serving prior bundle; optional artifact ignored by older clients |

## Exact first implementation after approval: Phase 1 only

After and only after written owner approval of the Phase 0 data contract, start in the existing worktree with the smallest core-only vertical slice:

1. Re-read `git status`, confirm branch/HEAD, then identify uncommitted overlaps in `packages/core`; do not overwrite or stage anything. If a target file has owner changes, make the smallest additive edit or stop for review.
2. Add optional versioned grid metadata/tile types to `packages/core`; do not replace `terrainAreas`, alter document defaults, or wire persistence/editor/runtime.
3. Add pure deterministic core functions for validation, canonical serialization/order and checksums. Enforce finite metadata/sample values, positive spacing/dimensions, agreed CRS/datum IDs, explicit no-data, sample/payload bounds, version rejection, and allocation bounds before allocating.
4. Add synthetic fixtures only. Add unit tests for valid round-trip and byte determinism; unsupported versions; invalid origin/spacing/dimensions; NaN/Infinity; no-data vs numeric zero; max/over-limit; checksum corruption; tile order; legacy documents with no grid remain semantically unchanged and not dirty on hydration.
5. Run only the focused core test/type/lint commands agreed for these files. Do not change package dependencies or run E5/Docker/cloud workflows in Phase 1.
6. Report exact changed files, commands/results, diagnostics delta, format examples, measured serialization sizes (only if actually measured), and all unresolved issues. Stop for owner acceptance before Phase 2.

### Phase 1 acceptance

- Deterministic serialization produces identical bytes/checksum for identical grid data across repeated runs.
- Deserialization round-trip preserves grid metadata, tile coordinates/order, sample values, mask and version.
- Invalid/oversize inputs fail before large allocation; no silent flattening or zero substitution.
- Unknown versions/checksum mismatch are rejected with actionable errors.
- Legacy polygon-only and terrain-free documents hydrate identically and remain not dirty.
- No UI, database, `terrain` scope payload, publish contract, global environment, dependency, or runtime changes.
- Focused tests pass; any existing baseline failure is reported, not hidden.

## Implementation requirements shared across phases

- Keep scoped saving opt-in/off by default. Explicit Save is required; verified acknowledgment before durable-success UI.
- Preview pointer updates do not mutate canonical document, create history entries, or issue HTTP requests. One completed gesture maps to one reversible command.
- Failure/conflict retains local IndexedDB draft. No blind authoritative reload that discards edits.
- Unchanged terrain creates no revision; terrain-only save leaves building, routing and campus-settings scopes unchanged.
- Publish is distinct from Save. Compile/checksum complete bundle, then atomic pointer update. Preserve optional-field compatibility.
- Do not add package dependencies unless the phase requires one and owner separately approves it; Three.js is deferred to Phase 6.
- Limit tests and commands to the phase. No broad type cleanup or unrelated legacy refactor.

## Safety boundaries

Never contact/write Supabase Development or Production; no cloud exports/migrations; no Vercel/GitHub actions, deployment, commit or push; no Docker cleanup/modification or D2 resource changes; no real campus data. E5 synthetic access requires separate explicit authorization at the persistence phase. No schema migration until separately reviewed and approved.

Stop and ask the owner if: CRS/origin/datum cannot be established for a real coordinate contract; any work would change existing E8 polygon meaning; dirty user changes overlap proposed edits; a dependency, environment/secret, migration, database write, deployment or protected resource action appears needed; payload caps or no-data semantics cannot be met; or tests expose data loss/non-deterministic serialization. Do not broaden scope to work around a blocker.

## References

- Completed audit: `reports/navi-studio-1.5-track-e9-audit/00-EXECUTIVE-SUMMARY.md` through `14-AUDIT-COMPLETION-AND-SAFETY-REPORT.md`.
- Owner decision record: `reports/navi-studio-1.5-track-e9-audit/E9-OWNER-DECISIONS.md`.
- E8.4/E8.5 synthetic reports referenced by audit report 14 remain prior evidence; they do not prove E9 grid behavior.
