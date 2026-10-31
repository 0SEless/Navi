# Track E2 — Browser Acceptance with Scoped History ON

## Configuration

- `NODE_ENV=development`
- `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true`
- `NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY=true`
- Synthetic campus/building/route fixtures and isolated localhost auth stub.
- `/api/dev/scoped-history` was the only additional API path allowed by the browser harness. External calls and other unexpected API paths were blocked.

## Result

The full configured Playwright run completed: **9 passed, 2 skipped, 0 failed** (11 discovered). The skipped scenarios are flag-off-only and drafts-disabled-only checks.

The browser exercised a building room edit and a synthetic waypoint deletion. The app sent building and routing operations to the Development-only loopback endpoint and displayed `Scoped operation validated locally; not cloud-saved` / local-only session status. The building edit survived reload through IndexedDB; the scoped-history session restarted with a distinct session ID and did not replay the old commit. IndexedDB remained the reload recovery boundary.

The mocked manual-save flow continued through the existing `/api/graph` path. The UI showed a pending state before acknowledgment and only showed `Saved locally and to cloud` after the latest edited document was acknowledged. No publish action was invoked; E1's existing publish code path was not redirected by the E2 change.

The scope classification/client tests cover unchanged projections, unsupported/invalid classification handling, building-plus-campus-routing submission as one batch, and mid-session flag disable. The client and route tests verify the two-scope batch produces one local revision. A multi-scope gesture was not created in the browser itself. Terrain authoring was not browser-tested because the exercised Floor Editor surface did not expose a terrain edit interaction.

`logs/playwright-results-flag-on.json` and `logs/local-server.log` retain the run evidence. This endpoint is ephemeral local reference state; it is not a durable cloud save.
