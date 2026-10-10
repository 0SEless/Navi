# R2 Connectivity Test (temporary, server-side only)

## Problem

NAVI is preparing for a future 360° panorama upload system backed by a private
Cloudflare R2 bucket (`navi-360`). Before any of that system is designed, we
need proof that the NAVI server can authenticate against Cloudflare R2's
S3-compatible endpoint and successfully write one object.

There is currently no R2 integration in `navi-next` at all: no
`@aws-sdk/client-s3` dependency, no `R2_*` environment-variable reads, and no
storage route.

## What (WHOWHAT — plain language)

A single, temporary API route that, when invoked server-side with an
authenticated NAVI session:

1. Checks that all required `R2_*` environment variables are present, without
   ever revealing their values.
2. Constructs an S3-compatible client from those variables (endpoint, region
   defaulting to `auto`, access key id, secret access key) — all server-side.
3. Performs one `PutObject` writing exactly:

   - Bucket: `navi-360` (read from `R2_BUCKET`)
   - Key: `_navi-tests/r2-connectivity-test.txt`
   - Body: `NAVI R2 connectivity test`

4. Returns a small JSON result that proves success, or a sanitized error that
   is useful for debugging without leaking configuration.

## Success criteria

1. `POST /api/r2-connectivity-test` with no session returns `401` and performs
   zero outbound network calls (asserted by test).
2. With a valid session and complete configuration, the response is
   `{ "ok": true, "provider": "cloudflare-r2", "bucket": "navi-360",
   "object": "_navi-tests/r2-connectivity-test.txt" }`.
3. With configuration missing, the response is `500` with an
   `missing_configuration` code and the **names** of the missing variables
   only — never any variable value.
4. If R2 rejects the request, the response is `502` with a sanitized error
   (error name/code, HTTP status, request id) and no message body, endpoint,
   or credentials.
5. Repository validation (`lint`, `test`, `tsc`, `build`) shows no new
   failures attributable to this change.

## Non-goals (explicitly out of scope)

- 360 upload UI, presigned URLs, direct browser-to-R2 uploads
- Public R2 URLs, CDN configuration, image processing
- 360 viewer integration, NAVI Studio integration
- Database changes, authentication changes
- Campus mapping / navigation changes
- Removing this endpoint (it is intentionally small and temporary; deleting it
  later is a one-file change plus its test)

## Security requirements (hard constraints)

- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` stay server-side only: no
  `NEXT_PUBLIC_*` R2 variables, no hard-coding, no logging, no echoing in
  responses, no commits.
- The bucket stays private: no `ACL`, no public-read, no presigning.
- The endpoint is a mutation, so it must sit behind the existing
  `requireVerifiedMutationAuth` gate (`src/lib/api-guard.ts`) like every other
  mutating NAVI route. No new or weaker auth mechanism is introduced.
- No unrelated NAVI functionality may be modified.

## Technical considerations

- Route location follows the existing App Router convention
  (`src/app/api/<name>/route.ts`) alongside `campuses`, `publish`,
  `floor-plans`, etc.
- The R2 helper lives in `src/lib/` next to `supabase-server.ts`, and refuses
  to build a client in a browser runtime.
- `R2_REGION` defaults to `"auto"` when unset (Cloudflare's documented value).
- Path-style addressing (`forcePathStyle: true`) is used because R2 is reached
  through a custom endpoint.
- The endpoint requires `POST` because it performs a write.

## Known pitfalls from ERRORS.md that apply

- Repository-wide `tsc --noEmit` sits on a large pre-existing baseline — a
  non-zero exit is not automatically caused by this change; verification must
  be scoped to touched files.
- Scoped lint can be blocked by pre-existing violations in other files — lint
  must be run per touched file.
- `graphify update .` is denied by managed Windows filesystem permissions in
  this checkout (`WinError 5`) — graph output must not be hand-edited.
- Browser/Chromium suites may be unavailable in this environment.
