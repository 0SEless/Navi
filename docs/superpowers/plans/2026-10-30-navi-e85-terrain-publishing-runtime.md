# Track E8.5 — Terrain Publishing and Runtime Plan

## Integration map

- Source of truth and E5 save: `CampusDocument`, `src/services/scoped-*`, existing authenticated local route.
- Compile: `/api/compile` calls `CampusCompiler.compileV2`; `buildArtifacts` constructs canonical `NavigationArtifacts`.
- Publish/read: `/api/publish` validates and stores the artifact blob; `/api/public-campus` returns the validated published blob and metadata.
- Load/cache: `src/store/public-store.ts` parses the public response; `src/features/public-campus/types.ts` validates a `CampusBundle`; IndexedDB retains revisioned published bundles.
- User UI: `/map/explore` and `/map/navigate` both render `src/components/public/ExploreMap.tsx`, which composes MapLibre layers.

## Tasks

1. Add failing compiler, artifact-validation, public-transport, cache, and MapLibre terrain tests. Preserve old bundles without terrain; reject malformed terrain as a whole published bundle.
2. Add the optional typed `terrainAreas` + `terrainVerticalDatum` projection from the authoritative `CampusDocument` to `NavigationArtifacts`; validate without rounding and retain the existing additive manifest version.
3. Carry terrain through compile response, publish artifact blob and checksummed manifest, public-campus response, client bundle, and cache. Do not call cloud publishing in acceptance.
4. Add a dedicated, non-extruded MapLibre terrain layer with elevation-aware color classes, click inspection panel, style reinitialization, and update-with-new-bundle behavior.
5. Extend the E8.4 local E5 browser harness: save in Studio; independently reconstruct E5; POST that reconstructed document through the real `/api/compile`; validate and hold the resulting compiled artifact in a test-only local publication adapter; load it through `/api/public-campus` into the real ExploreMap and Navigate app; test update, unchanged, and legacy cases.
6. Run focused compiler, API, client-cache, layer, routing/map, E8.4, Playwright, PostgreSQL, ESLint, and TypeScript baseline checks. Write all E8.5 evidence and logs; claim PASS only if the full acceptance definition passes.

## Verification commands

- Focused Vitest: compiler artifact and validator files, public store/cache, terrain layer, ExploreMap, public-campus/publish/compile route tests, existing E8.4 geometry + persistence tests.
- `npx playwright test --config playwright.track-e8-5.config.ts` via the isolated synthetic E5 runner.
- `npx eslint` on all changed TS/TSX files.
- `npx tsc --noEmit`, compare against the 1,123 E8.4 diagnostics and report diagnostics in changed files.

## Boundaries

The publication adapter exists only in the synthetic browser harness. The real `/api/publish` implementation is extended, but it is not invoked against Supabase during E8.5. No elevation is assigned to buildings, roads, or routes. No topology or mesh generation is changed.
