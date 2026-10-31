# Regression Results

## Passed

- Focused E8 tests: 8 files, 81 tests passed. Coverage included save request/auth route, save session/client, snapshot and scope diff, PostgreSQL adapter/runtime, and document-selector behavior.
- Snapshot adoption regression: 1 file, 4 tests passed.
- E5 writer/reader integration rehearsal: both modes passed.
- Final Playwright: single-building editor save/reload, 1 passed; independent E5 verify passed.
- Focused ESLint on the new/fixed E8.2 services, DocumentStore, selector regression, bridge, and E2E harness passed with no output.

## TypeScript comparison

`npx tsc --noEmit` exits 2 because the repository has existing diagnostics. E8.1 baseline: 1,124; final E8.2: 1,124. No additional diagnostics remain in the changed scoped-save, document-store, history bridge, or browser acceptance files. The intermediate E8.2 instrumentation errors were corrected before this final comparison.

Final log: `logs/typescript-current-final.log`.

## Broader lint limitation

An ESLint run over the entire set of touched E8 surfaces reports existing findings outside the E8.2 fix: five `no-explicit-any` findings in legacy areas of `src/components/studio/EditorBridge.tsx` and one existing `set-state-in-effect` finding in `src/components/studio/StudioWorkspace.tsx`. A transient conditional-hook finding in `use-document-version.ts` was fixed, and the focused ESLint set passes. These broader findings were not expanded into unrelated refactoring.

## Preserved failures and warnings

The failed pre-fix Playwright reload run and trace remain under `logs/classification-trace-947846561faa445491e2486b4e39a08f/`. Browser logs also include a map-style missing-source warning from the synthetic canvas; it did not block selection, saving, reload, or the acceptance assertions.
