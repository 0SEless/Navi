# PLAN — R2 Connectivity Test

## T1 — Install `@aws-sdk/client-s3`

- **Files:** `package.json`, `package-lock.json`
- **Action:** `npm install @aws-sdk/client-s3` inside `navi-next/` (npm
  workspaces, `package-lock.json` is the existing lockfile). No other
  dependency may change.
- **Errors this task could introduce:** lockfile churn beyond the new
  package; accidental dependency hoisting changes.
- **Acceptance:** `package.json` lists `@aws-sdk/client-s3` under
  `dependencies`; `git diff package-lock.json` shows only additions for that
  package tree; `Test-Path node_modules/@aws-sdk/client-s3` is `True`.

## T2 — Server-only R2 helper (`src/lib/r2.ts`)

- **Files:** `src/lib/r2.ts` (new)
- **Action:** export
  - `R2_REQUIRED_ENV_VARS` (names only),
  - `readR2Config()` returning either the config or the **list of missing
    variable names**,
  - `createR2Client()` building an `S3Client` from
    `endpoint`, `region ?? "auto"`, `accessKeyId`, `secretAccessKey`,
    `forcePathStyle: true` — throwing if invoked in a browser runtime,
  - `runR2ConnectivityTest()` performing `PutObject` on
    `_navi-tests/r2-connectivity-test.txt` with body
    `NAVI R2 connectivity test` into `process.env.R2_BUCKET`,
  - a sanitizer that reduces an SDK error to `{ code, httpStatus, requestId }`.
- **Errors this task could introduce:** echoing env values; logging raw
  errors that could carry sensitive request material; leaking a client into a
  client bundle.
- **Acceptance:** no literal credential strings anywhere; the only strings
  returned on failure are variable *names*, an error *name*, a status code,
  and a request id; `typeof window !== "undefined"` guard present.

## T3 — API route (`src/app/api/r2-connectivity-test/route.ts`)

- **Files:** `src/app/api/r2-connectivity-test/route.ts` (new)
- **Action:** `export const runtime = "nodejs"`; `POST` handler that
  1. calls `requireVerifiedMutationAuth(request)` and returns its `401`/`403`
     response unchanged when non-null,
  2. runs the helper,
  3. maps result → `200` success payload, `500 missing_configuration`,
     `502 r2_request_failed`.
- **Errors this task could introduce:** skipping the auth gate (weakens
  security); returning `error.message` verbatim (may include endpoint or
  signing detail).
- **Acceptance:** success payload is exactly
  `ok/provider/bucket/object`; no other field; no auth bypass.

## T4 — Tests

- **Files:**
  - `src/app/api/r2-connectivity-test/__tests__/route.test.ts` (new)
  - `src/app/api/__tests__/route-auth-wiring.test.ts` (one case added)
- **Action:** cover (a) no session → `401` with zero network calls,
  (b) missing config → sanitized `500` with sentinel env values absent from
  the body, (c) mocked `PutObject` success → exact success payload,
  (d) mocked SDK rejection → sanitized `502` with no secret/endpoint text,
  and register the route in the existing privileged-mutation wiring test.
- **Errors this task could introduce:** a test that performs a real network
  call; a test that prints env values.
- **Acceptance:** `npx vitest run src/app/api` passes.

## T5 — Validation

- **Files:** none (read-only)
- **Action:** run, in order: scoped `eslint` on touched files, `npx vitest run
  src/app/api`, `npx tsc --noEmit` (compare against the pre-existing
  baseline), `npm run build`. Record which checks could not run locally.
- **Acceptance:** no new failures versus baseline; evidence pasted into
  `progress/PROGRESS.md`.

## T6 — Security review + log

- **Files:** `progress/PROGRESS.md`, `errors/ERRORS.md` (append only)
- **Action:** review `git diff` of this feature's files only (the working
  tree already contains unrelated uncommitted work); run the six-point
  security checklist; append the session entry.
- **Acceptance:** checklist all-pass, report produced.
