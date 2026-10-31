# Local browser harness

## Safety boundary

The Playwright harness launches the Next dev server on 127.0.0.1 ports 3187/3188 and a local auth stub on 127.0.0.1 ports 3989/3990. It uses synthetic two-building/floor documents. The local stub answers the auth user lookup as unauthenticated and rejects data/storage requests; graph save behavior is intercepted in Playwright. Browser guards block requests to non-loopback hosts.

No Supabase project credentials, Vercel Preview, external storage, real campus data, publishing, or cloud writes are used. The supplied Supabase-shaped values are inert localhost test configuration, not service credentials.

The production authentication guard was inspected: mock auth is disabled when NODE_ENV is production, and the API guard also treats production Vercel runtime as production. No auth checks were weakened.

## Harness artifacts

- playwright.track-c1.config.ts
- e2e/support/track-c1-local-server.mjs
- e2e/track-c1-local-drafts.spec.ts
- Existing screenshots and Playwright results are retained under logs/.
- Fresh continuation browser output was captured in the command transcript; no passing screenshots were emitted by the fresh run. Earlier screenshots document local saved, quota-error, delayed-ACK and process-restart UI states.

## Current usability and limitations

System Chrome was present. No process held the harness ports before test startup. The default Vitest temporary directory was blocked by the Windows sandbox atomic rename; setting TEMP and TMP to the worktree-local .tmp-vitest folder allowed tests to run. This is a test-runner filesystem constraint, not an application failure.

The dev server logs an AggregateError about three services failing to destroy on some navigation/unmount paths. Browser assertions still pass; cleanup remains a known issue. The browser harness covers actual Studio/Floor Editor UI paths and IndexedDB in Chromium, but it does not simulate every browser/OS crash mode.
The concise rerun transcript is saved at logs/browser-final-20261029.md.

