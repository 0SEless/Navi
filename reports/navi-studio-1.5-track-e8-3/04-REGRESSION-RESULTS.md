# Track E8.3 — Regression Results

- Focused Vitest after recovery changes: 4 files, 27 tests passed. Log: `logs/final-focused-vitest.log`.
- Existing scoped-save and publish regression runs: 70 focused tests and 17 publish tests passed earlier in this E8.3 work; logs: `logs/focused-vitest.log` and `logs/publish-regression-vitest.log`.
- Flags-off Playwright: 1 test passed. It observed the legacy `/api/graph` save path and no scoped-save UI. Publish remained disabled by the existing validation warning, so the browser did not call `/api/publish`; publish request behavior is supported by the separate mocked regression tests. Log: `logs/legacy-final-b882180ab4af.log`.
- PostgreSQL browser verification: 2 tests passed, 1 mode-specific test skipped; log: `logs/browser-46b34be9990b4617/postgres-verify-final.log`.
- TypeScript: 1,124 diagnostics, equal to the E8.2 baseline of 1,124. `tsc --noEmit` exits 2; the repository is not type-clean. No new diagnostics were reported in the E8.3 files. Log: `logs/typescript-final-e8-3.log`.
- ESLint on the E8.3-owned files excluding `EditorBridge.tsx`: passed. The focused set including `EditorBridge.tsx` reports five existing `@typescript-eslint/no-explicit-any` errors at lines 429, 441, 444, 456, and 457, outside this change. Log: `logs/final-eslint-e8-3.log`.

No dependencies were installed. Existing source changes and the dirty worktree were preserved; nothing was committed or pushed.
