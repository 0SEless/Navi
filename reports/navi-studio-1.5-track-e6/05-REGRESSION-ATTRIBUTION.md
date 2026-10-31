# Regression Attribution

## E5.2 broad checks retained

E5.2 recorded:

- Vitest: 34 failed, 6,190 passed, 8 skipped.
- TypeScript: 1,128 diagnostics.
- ESLint: 1,556 errors and 11,644 warnings.

No verified pre-E5 baseline exists in the retained reports/logs. Therefore broad failures cannot be classified as inherited or newly introduced based only on timing.

## Evidence-backed classification

- **Direct scoped persistence regressions observed in E6:** none in the focused suite; 147 relevant scoped/save/legacy tests passed.
- **Focused lint for scoped files:** zero diagnostics, exit code 0.
- **Previously observed fixture/configuration issue:** E5.2 Vitest and TypeScript logs show imports for `packages/editor/src/demo/golden-campus` failing because the module is absent. This explains those diagnostics, but not whether that absence predates E5; attribution remains unknown.
- **Other E5.2 broad failures:** compiler/routing assertions, legacy recovery, and assorted editor/route checks remain unclassified without a baseline.
- **Newly introduced E6 source regressions:** none; no application source file was modified during E6.
- **TypeScript/ESLint broad counts:** not rerun. Historical logs contain no diagnostics naming the scoped persistence files searched during review.

No unrelated test fixture or repository-wide cleanup was attempted.

