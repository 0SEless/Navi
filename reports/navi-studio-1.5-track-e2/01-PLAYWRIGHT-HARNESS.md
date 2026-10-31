# Track E2 — Playwright Harness and Generated-Type Diagnosis

## Harness findings

The E1 report described timeouts at `127.0.0.1:3187`. E2 inspected existing listeners and process ownership, startup output, the Playwright `webServer` setup, fixture/auth stubs, host binding, proxy variables, Next development behavior and generated type output. Ports 3187, 3188, 3189, 3190, 3989 and 3990 were free at diagnosis time. Proxy environment variables were unset. The only pre-existing NAVI Next process was on port 3000 in a separate checkout; it was left untouched.

The app startup delay was observable, but the server could become responsive when readiness was checked against the actual app. A standalone harness run bound app/auth/health listeners to loopback, reported Next.js 16.2.9 Turbopack ready, returned HTTP 200 from `/`, and returned `{ready:true}` from `/ready`. The app response arrived after about 5.5 seconds. The prior E1 timeouts did not establish a firewall failure.

The prepared harness now supports separate app/auth/health ports, an isolated auth stub that rejects data/storage calls, explicit startup logs, an app-readiness poll with bounded startup time, and reuse only when explicitly marked as a previously verified server. Playwright waits on the readiness endpoint before starting browser tests. The configured timeout is 180 seconds; the harness itself stops only its owned Next child on a bounded startup failure.

## Generated `.next/dev` types

The earlier TS1434 in `.next/dev/types/validator.ts` was observed while Next was generating development route types. A later generated read contained a valid import. No generated file was manually edited, and the `.next` directory was not deleted. The current standard TypeScript run reports the unchanged 1,128-diagnostic baseline; the E1 logs also recorded 1,128. The two TS2554 entries in the Floor Editor page and `EditorBridge.tsx` predate E2 and appear in the E1 TypeScript logs at the corresponding prior lines.

## Verification artifacts

- `logs/local-server.log` — loopback server ownership, readiness polling and Next stdout/stderr across the completed browser runs.
- `logs/playwright-results-flag-off.json` — final 11-scenario flag-off run: 8 passed, 3 skipped, 0 unexpected, 0 flaky.
- `logs/playwright-results-flag-on.json` — final 11-scenario flag-on run: 9 passed, 2 skipped, 0 unexpected, 0 flaky.
- `logs/focused-vitest.log` and `logs/eslint-focused.log` — final focused checks.
- `logs/server-syntax-check.log` — final local-server JavaScript syntax check.
- `logs/typescript-current.log` — full TypeScript diagnostics for baseline comparison.

The protected D6 archive was rechecked before source edits; its SHA-256 matched the sidecar: `dc9327641f30c0b498f327d84075cccba7679f2ab2b7926f98ef77b5d33e0c8e`.

Next dev emitted an `Editor context cleanup failed: AggregateError: 3 service(s) failed to destroy` message during teardown in the browser runs. The focused scenarios still completed successfully. This existing teardown warning is also recorded in the shared error ledger; E2 did not modify service teardown behavior.
