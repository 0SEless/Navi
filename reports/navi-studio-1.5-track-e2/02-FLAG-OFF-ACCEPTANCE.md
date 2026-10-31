# Track E2 — Browser Acceptance with Scoped History OFF

## Configuration

- `NODE_ENV=development`
- `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true`
- `NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY=false`
- Synthetic campus/building/room fixtures and isolated localhost auth stub.
- Browser interception rejected unexpected application API calls and every external request. `/api/graph` was handled by the local mock for save-compatibility checks.

## Result

The full configured Playwright run completed: **8 passed, 3 skipped, 0 failed** (11 discovered). The skips are the flag-on-only cases and the separate drafts-disabled variant.

Verified behaviors included Studio/Floor Editor loading, synthetic fixture hydration, building and room editing, dirty/local draft behavior, IndexedDB reload and process-restart recovery, offline edits, quota failure reporting, corrupt-draft preservation, and manual Cloud Save behavior under the mocked response. The flag-off-specific assertion observed no calls to `/api/dev/scoped-history` after editing.

Manual Cloud Save was checked while the mock acknowledgment was pending and after a later local edit; the browser kept the newer IndexedDB edit local. A second scenario delayed the acknowledgment without making a later edit and observed the rendered `Saved locally and to cloud` confirmation only after the mock acknowledged the current version.

No actual cloud endpoint was contacted. `logs/playwright-results-flag-off.json` has the machine-readable result; `logs/local-server.log` retains server output.
