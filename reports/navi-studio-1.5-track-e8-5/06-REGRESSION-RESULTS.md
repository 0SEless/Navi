# Regression Results

## Final-state verification

- Terrain bounds/GeoJSON, `ExploreMap`, and MapLibre layer/lifecycle focused Vitest: **3 files, 18 tests passed**.
- Synthetic E8.5 Playwright browser-to-E5-to-compiler-to-runtime: **1 passed**, including visible-feature checks in Explore, fresh-context Explore, and Navigate.
- Focused ESLint on the E8.5 runtime, tests, helper and browser spec: **exit 0**, no findings after callback dependencies were corrected.
- Full TypeScript check: **not clean**. E8.4 baseline was **1,123 diagnostics**; current final check also has **1,123**. The diagnostic signatures in changed E8.5 files match existing baseline findings; no new E8.5 diagnostic was identified. `ExploreMap.tsx` still reports the pre-existing `NavigationCamera` prop-union TS2322, with its line shifted by the new bounds code. Raw output: `logs/typescript-final.log`.

The focused 18-test result and final browser result are in the logs and the runner directory respectively. Earlier E8.5 implementation verification also ran a focused 17-file / 147-test batch; its preserved output is `logs/focused-vitest.log`. An additional broader run that included `compile-v2-integration.test.ts` was interrupted and is not counted as a pass.

## Broader lint history

The earlier broader selection that also included existing compiler tests reported two `no-explicit-any` errors in `packages/compiler/src/__tests__/build-artifacts.test.ts` at lines 138 and 151, plus existing unused imports/helpers. It also reported an unused `LatLng` import in `published-campus.ts`. The final focused E8.5 runtime selection is clean; repository-wide lint is not claimed clean.

## Compatibility coverage

Tests cover optional terrain field validation, terrain preservation in artifacts, corrupt data rejection, checksum transport, terrain layer style recreation without duplicate sources/layers, no terrain controls for legacy bundles, unchanged terrain checksums, cache revision update, legacy building search, and Explore/Navigate usage. Raw Playwright trace artifacts from failed diagnostic attempts were preserved in their run folders; the successful final run completed without failure attachments.
