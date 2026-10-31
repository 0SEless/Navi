# Browser Acceptance

## Final run

- Command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/track-e8-5-run-synthetic-acceptance.ps1`
- Result: **1 passed**, Playwright test body 23.9 seconds; total 29.2 seconds.
- Campus: `navi-e8-browser-bb67734817d44c04` (synthetic).
- Raw evidence: `logs/run-bb67734817d44c04a63c70ded059abd0/playwright.log`.

## Verified in the actual app

- Studio drew a four-vertex synthetic terrain area and explicitly saved it; the server returned one durable terrain-scope acknowledgment at E5 revision 1.
- The reconstructed document was sent to `/api/compile`. Its polygon and campus datum matched the saved source.
- Explore received a terrain-enabled published bundle, displayed the polygon, let the user select it, and showed 3.25 m relative to the named synthetic datum.
- Unchanged compilation kept the terrain checksum and E5 revision unchanged.
- A second explicit elevation edit/save changed the terrain to 4.5 m at E5 revision 2.
- Same-context reload exercised cached revision 1 followed by network revision 2. A fresh browser context loaded revision 2 directly and displayed 4.5 m.
- A legacy compiled bundle without terrain retained its building and search behavior.
- Navigate loaded the same terrain bundle, rendered the polygon, and displayed the 4.5 m entry.

The screenshots are browser captures from the final run, not mock render assertions: `logs/e8-5-runtime-terrain.png`, `logs/e8-5-navigate-terrain.png`, and `logs/e8-5-legacy-runtime.png`. The E2E used synthetic local authentication and E5 only. It did not call Supabase.

## Diagnostic history

Earlier E8.5 runs exposed (1) the route-bounds versus terrain-bounds mismatch and (2) a test telemetry callback using a nonexistent point conversion method. Both were corrected; the successful final run includes viewport feature assertions and is retained separately. A sandbox-only Docker named-pipe denial also occurred before the elevated authorized runner; it performed no resource changes. All run directories remain under `logs/`.
