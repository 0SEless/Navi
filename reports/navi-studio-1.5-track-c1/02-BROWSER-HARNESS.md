# Local Browser Harness

## Isolation

The Track C1 Playwright harness uses synthetic campus/building/floor data generated locally. The app server binds to `127.0.0.1` (enabled-draft port 3187; disabled-draft port 3188) and the local auth stub uses loopback ports 3989/3990. Supabase values are inert placeholders; the stub rejects writes. A browser network guard blocks non-local requests. The sole extra bootstrap response is a local empty campus list (`{ maps: [] }`). Graph API behavior is intercepted. Tests use an isolated Chrome profile and do not use the user's normal browser profile.

## Files

- `playwright.track-c1.config.ts`
- `e2e/support/track-c1-local-server.mjs`
- `e2e/track-c1-local-drafts.spec.ts`

## Lint and evidence

Focused ESLint on the harness, spec, and config: 0 errors / 0 warnings. Detailed JSON: `logs/eslint-harness-final.json`.

Browser screenshots and Playwright JSON are under `logs/`. `logs/playwright-results.json` is the separate feature-flag-disabled run (1 passed). The enabled-draft run had 6 passed and 1 skipped; the skip is the flag-disabled case because it is exercised by the separate server configuration.

Some Next development server teardown/navigation paths logged `Editor context cleanup failed: AggregateError: 3 service(s) failed to destroy`. This did not fail the browser assertions but remains an unresolved local cleanup warning. Quota and corrupt-record storage failures are deliberately injected test cases, not unexpected failures.
