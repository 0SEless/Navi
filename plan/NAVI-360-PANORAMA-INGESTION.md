# PLAN — NAVI 360 Panorama Ingestion (infrastructure readiness)

Spec: `spec/NAVI-360-PANORAMA-INGESTION.md`.
Approved decisions: presigned PUT upload, R2 object key stored as
`imageAssetId`, presigned GET retrieval, `/api/r2-connectivity-test` untouched.

Error-prevention baseline (from `errors/ERRORS.md`, applies to every task):
**E1** never interrupt `npm install` (lockfile zero-fill) — use
`--package-lock-only` first and parse-verify the lock; **E2** Vercel env names
are case-sensitive and need a redeploy; **E3** `vercel env pull` redacts R2
credentials — object verification happens via presigned GET or the Cloudflare
dashboard; **E4** new request-state guards require cookie-bearing test doubles
and a "guard ran before any write" assertion; **E5** root `tsc` is on a
pre-existing failure baseline — verify scoped to touched files.

---

## T1 — Install `@aws-sdk/s3-request-presigner`

- **Files:** `package.json`, `package-lock.json`
- **Action (E1):** run `npm install --package-lock-only
  @aws-sdk/s3-request-presigner` first; verify the lock parses as JSON with no
  NUL bytes; then the real install; byte-scan
  `node_modules/@aws-sdk/s3-request-presigner` for all-NUL files. Never
  interrupt the install.
- **Errors this task could introduce:** lockfile churn beyond the new package
  tree; zero-filled lockfile/node_modules (E1).
- **Acceptance:** `package.json` lists the dependency; lockfile parses as JSON
  (`node -e "JSON.parse(...)"`), diff shows only the presigner tree;
  `Test-Path node_modules/@aws-sdk/s3-request-presigner` is `True`.

## T2 — Object-key convention module (Phase 2)

- **Files:** `src/lib/panorama-keys.ts` (new),
  `src/lib/__tests__/panorama-keys.test.ts` (new, written RED first)
- **Action:** export
  - `PANORAMA_ALLOWED_CONTENT_TYPES` = `image/jpeg | image/png | image/webp`,
  - `PANORAMA_MAX_BYTES` (25 MiB),
  - id pattern for `campusId`/`panoramaId` (lowercase alnum + `-_`, no `..`,
    length-bounded),
  - `extensionForContentType(contentType)`,
  - `buildPanoramaKey(campusId, panoramaId, contentType)` →
    `panoramas/<campusId>/<panoramaId>.<ext>` — deterministic, so re-ingest of
    the same panorama replaces its own object and can never touch another,
  - `isPanoramaKey(key)` strict validator used by resolve/complete.
- **Errors this task could introduce:** key-injection (`../`, absolute paths,
  encoded separators) that would let a signed URL target an object outside the
  panorama namespace.
- **Acceptance:** RED tests first prove traversal attempts
  (`../../x`, `panoramas/../../x`, `a/b`, empty, uppercase, control chars) are
  rejected and valid ids round-trip; GREEN after implementation.

## T3 — Presign helpers in `src/lib/r2.ts` (Phase 3)

- **Files:** `src/lib/r2.ts`, `src/lib/__tests__/r2-presign.test.ts` (new,
  RED first)
- **Action:**
  - amend the header (L1–16): replace the "no presigned URLs" clause with the
    new contract — server-only signing, short TTLs, keys always
    server-generated, bucket private, connectivity test retained unchanged;
  - add `presignPanoramaPut(config, key, contentType, ttlSeconds)` and
    `presignPanoramaGet(config, key, ttlSeconds)` using
    `getSignedUrl` + `PutObjectCommand`/`GetObjectCommand` (pure local
    signing, zero network), browser-runtime guard like `createR2Client`;
  - constants `PANORAMA_PUT_TTL_SECONDS = 600`, `PANORAMA_GET_TTL_SECONDS =
    300`.
- **Errors this task could introduce:** long-lived URLs (defeats revocation),
  signing an arbitrary key without validation (T2 validator must be the only
  path from request → signer), leaking config into thrown messages.
- **Acceptance:** tests assert the signed URL targets exactly the bucket+key,
  carries `X-Amz-Expires=600`/`300`, contains no credential material beyond
  the standard signature params, and throws in a browser runtime.
  Content-Type is NOT signature-bound: `@aws-sdk/s3-request-presigner`
  hardcodes it as unsignable (`dist-cjs/index.js:47`, verified) — the test
  locks in `X-Amz-SignedHeaders=host`, and enforcement lives in the sign-time
  allowlist plus T5's `HeadObject` completion check. `runR2ConnectivityTest`
  and its route remain byte-identical.

## T4 — Migration `015_panorama_assets.sql` (Phase 5)

- **Files:** `supabase/migrations/015_panorama_assets.sql` (new)
- **Action:** additive table in the style of `007`/`008`:
  `key text primary key` (the R2 object key), `campus_id`, `panorama_id`,
  `content_type`, `byte_size bigint`, `status text check (status in
  ('signed','uploaded'))`, `uploaded_by text null`, `created_at`,
  `updated_at`; index on `campus_id`; `enable row level security`; **revoke
  all from `anon`/`authenticated`/`public`** — all reads/writes go through the
  server's existing service-role path (`getClient("secret")` pattern from
  `api/graph/route.ts`, service role bypasses RLS per migration 003).
- **Discovery gate:** determine how migrations are applied in this project
  (Supabase CLI link vs dashboard). If no apply path exists locally, STOP and
  ask the user to run the SQL — do not improvise a DDL channel.
- **Errors this task could introduce:** destructive change (forbidden — this
  migration must be purely additive: `create table if not exists` only, no
  `drop`), over-broad grants, RLS left disabled.
- **Acceptance:** file contains no `drop`/`truncate`/`alter` of existing
  objects; grants leave the table service-role-only; SQL reviewed against
  migration-007 style.

## T5 — Upload route `POST /api/panorama-upload` (Phase 4)

- **Files:** `src/app/api/panorama-upload/route.ts` (new),
  `src/app/api/panorama-upload/__tests__/route.test.ts` (new, RED first),
  `src/app/api/__tests__/route-auth-wiring.test.ts` (one case line)
- **Action:** `export const runtime = "nodejs"`; two actions in the JSON body:
  - `{"action":"sign","campusId","panoramaId","contentType","byteSize"}` →
    `requireVerifiedMutationAuth` → `assertCampusMutationAllowed(campusId)`
    → validate ids/contentType/size → `buildPanoramaKey` → presign PUT
    (600 s) → upsert `panorama_assets` row (`status='signed'`) via service
    role → `200 { ok, key, uploadUrl, expiresAt, requiredContentType,
    maxBytes }`;
  - `{"action":"complete","key"}` → same auth → `isPanoramaKey` → `HeadObject`
    on R2 (real existence, actual `ContentLength` ≤ `PANORAMA_MAX_BYTES`,
    `ContentType` match) → update row to `status='uploaded'` with verified
    size → `200 { ok, key, byteSize, contentType }`.
  - Failure mapping mirrors the R2 endpoint: `400` validation,
    `401/403/423` guards untouched, `500 missing_configuration` (names only),
    `502` sanitized `{code, httpStatus, requestId}` — never an error message,
    endpoint, or URL.
- **Errors this task could introduce:** skipping the auth gate; letting the
  client choose the key; echoing `uploadUrl` on error paths; writing rows for
  unvalidated payloads; E4 (tests without cookie fixtures / without asserting
  the guard precedes any DB/R2 call).
- **Acceptance:** RED suite proves (a) no session → 401 with zero presign/DB
  calls, (b) invalid key/ids/type/size → 400 and no signing, (c) protected
  campus → 423, (d) mocked success → exact payload shape, (e) mocked R2
  rejection → sanitized 502 with sentinel secrets absent from the body, (f)
  route registered in `route-auth-wiring.test.ts`.

## T6 — Resolve route `GET /api/panorama-resolve` (retrieval half of Phase 8)

- **Files:** `src/app/api/panorama-resolve/route.ts` (new),
  `src/app/api/panorama-resolve/__tests__/route.test.ts` (new, RED first)
- **Action:** `GET ?key=…` → `isPanoramaKey` → registry lookup
  (`panorama_assets` where `status='uploaded'`) via service role → presign GET
  (300 s) → `200 { ok, url, expiresAt }`; unknown/unregistered key → `404`;
  malformed key → `400`. **Audience is an open question for plan review**
  (public-with-registry-gate vs admin-only — see below); whichever is chosen,
  the registry gate is mandatory so a signed URL can never be minted for a key
  outside the namespace.
- **Errors this task could introduce:** signing arbitrary keys (private-bucket
  bypass), unauthenticated URL minting without an explicit approved policy,
  putting the URL in logs.
- **Acceptance:** RED suite proves traversal/malformed keys → 400 with zero
  signing, unregistered key → 404 with zero signing, registered key → URL with
  `X-Amz-Expires=300`, no credential material anywhere in body/logs.

## T7 — R2 bucket CORS rule (Phase 6) — **user action expected**

- **Files:** none in repo (Cloudflare dashboard); policy documented in the
  progress log
- **Action:** provide the exact CORS JSON (allowed origins
  `https://navi-next.vercel.app` + `http://localhost:3000`; methods
  `PUT, GET, HEAD`; allowed headers `Content-Type`; expose `ETag`;
  max-age `3600`) and ask the user to apply it to `navi-360`, or obtain an
  approved API-token path. Browser `PUT` to `*.r2.cloudflarestorage.com`
  fails without it.
- **Errors this task could introduce:** an over-broad CORS policy
  (`"*"` origins/methods) — must be explicit allowlists.
- **Acceptance:** policy applied and confirmed (screenshot or dashboard
  confirmation from the user) before T9 browser upload.

## T8 — Generate the >4.5 MB test image (Phase 7)

- **Files:** temp path only (never committed)
- **Action:** produce a real JPEG (`FF D8 FF` magic) larger than Vercel's
  4.5 MB cap, deterministic content so byte-comparison is meaningful.
- **Errors this task could introduce:** committing the binary; using a fake
  "image" that would not prove the real-content path.
- **Acceptance:** file > 4,700,000 bytes, parses as JPEG, deleted or kept only
  in temp afterwards.

## T9 — Deploy + E2E through the real path (Phase 8) — **approval gate**

- **Files:** none new (scoped commits only, via blob-level staging so mixed
  log files contribute only this session's lines — pattern in
  `Temp\opencode\stage-r2*.js`)
- **Action (requires explicit user approval before commit/deploy):** commit
  T1–T6 files → deploy from a clean detached worktree at that SHA (proven
  pattern from the R2 task; no `origin/master` push) → drive the real flow in
  a browser with an authenticated NAVIADMIN session:
  1. `POST /api/panorama-upload` `sign` → 200 with key + `uploadUrl`,
  2. browser `fetch(uploadUrl, { method:'PUT', headers:{'Content-Type':
     'image/jpeg'}, body })` → 200 (this is what T7 CORS unblocks),
  3. `complete` → 200 with verified byte size,
  4. `GET /api/panorama-resolve?key=` → 200 URL → fetch image → hash
     matches the local file,
  5. independent confirmation via Cloudflare dashboard (user) — object under
     `panoramas/…`, `image/jpeg`, size ≈ test file, bucket still **Public
     Access Disabled**.
- **Errors this task could introduce:** deploying unrelated dirty files (must
  build from a clean worktree at the exact commit); committing user-owned log
  edits (E: partial staging only); printing the presigned URL into logs.
- **Acceptance:** all five steps pass with evidence recorded; upload size
  proves the 4.5 MB cap is bypassed.

## T10 — Delivery-readiness report (Phase 9)

- **Files:** `progress/PROGRESS.md` (append)
- **Action:** report what is proven ready (sign→PUT→complete→resolve E2E),
  what remains (viewer wiring — out of scope, public-read policy if deferred),
  and residual risks.
- **Acceptance:** report cites concrete evidence for each claim.

## T11 — Full verification sweep (Phase 10)

- **Files:** none (read-only)
- **Action:** scoped `eslint` on touched files; `npx vitest run src/app/api
  src/lib` (new suites + neighbors); scoped `tsc --noEmit` compared against
  baseline (E5: 3 pre-existing `data-identity-comparison.test.ts` errors);
  `npm run build` (route list must still contain
  `/api/r2-connectivity-test`).
- **Acceptance:** zero new failures vs baseline; evidence pasted into
  `progress/PROGRESS.md`.

## T12 — Regression + security validation (Phase 11)

- **Files:** read-only, plus `errors/ERRORS.md`/`progress/PROGRESS.md`
  appends if findings occur
- **Action:** verify `/api/r2-connectivity-test` unchanged (`git diff` empty
  for that path; unauthenticated `POST` → `401`); grep confirms zero
  `NEXT_PUBLIC_R2_*`; run the security checklist (creds server-side, bucket
  private, TTLs bounded, keys server-generated, guards wired, sanitized
  errors); `graphify update .` attempt (record `WinError 5` if denied, never
  hand-edit graph output).
- **Acceptance:** checklist all-pass; connectivity endpoint byte-identical.

## T13 — LOG (Phase 12)

- **Files:** `progress/PROGRESS.md`, `errors/ERRORS.md` (append only)
- **Action:** session entry with what/verification/next; append every new
  error encountered in the standard 5-field format. Mixed log files: stage
  only this run's lines at blob level if/when committing — never the user's
  pre-existing unstaged entries.
- **Acceptance:** both logs updated and re-read to confirm encoding is clean
  (no mojibake — append with `Add-Content`, never `Set-Content -Encoding`).

---

## Decisions (plan review, 2026-09-25)

1. **Resolve audience (T6):** public, registry-gated — `GET
   /api/panorama-resolve` needs no session but only serves keys present in
   `panorama_assets` with `status='uploaded'`.
2. **Live E2E (T9):** approved — scoped commit (blob-level staging of mixed
   logs) + production deploy from a clean detached worktree at that SHA, no
   push to `origin/master`, E2E driven with the NAVIADMIN session.
3. **Migration apply path (T4):** this run writes and reviews
   `015_panorama_assets.sql`, then **stops and hands the SQL to the user** to
   apply; the rest of the pipeline proceeds once the user confirms.
4. **CORS (T7):** user applies the provided policy in the Cloudflare
   dashboard.
