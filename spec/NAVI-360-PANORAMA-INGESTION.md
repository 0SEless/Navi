# NAVI 360 Panorama Ingestion (infrastructure readiness)

## Problem

The private Cloudflare R2 bucket `navi-360` exists and the NAVI server can
write to it — but only via the temporary connectivity test, which hard-codes
one 25-byte object. There is no path to **receive**, **store**, or **track**
a real 360° panorama image.

Meanwhile panoramas are already first-class in the authoring model: the
Studio document carries `Panorama { id, label, imageAssetId, hotspots[] }`
(hardened by `3db675b`), and `PanoramaEntry.imageAssetId` ships unchanged
through the frozen `panoramaIndex` artifact (spec M6.5a) into the runtime
`PanoramaService` (M6.5b). Nothing ever fills `imageAssetId` with a usable
value — `InteractionController.tsx:384` creates it as `''`, and
`explore-contracts.ts:170` rejects empty ids, so authored panoramas silently
never publish.

Infrastructure constraints that shaped this design:

- Vercel functions cap **request and response bodies at 4.5 MB**
  (`413 FUNCTION_PAYLOAD_TOO_LARGE`, no configuration bypass). Real
  equirectangular panoramas are typically 2–20 MB, so any design that routes
  image bytes through a Next.js route handler is dead on arrival for real
  content.
- The bucket must stay **private** (Public Access Disabled, already verified).
- `vercel env pull` redacts `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, so no
  local machine can reconstruct R2 credentials — all signing must happen
  server-side in the deployed app.

## Decisions (user-approved at Phase 0, 2026-09-25)

1. **Upload strategy:** presigned `PUT` — server validates and signs, browser
   uploads directly to R2. Bypasses the 4.5 MB cap; credentials never leave
   the server.
2. **Retrieval mechanism:** presigned `GET` — the viewer resolves a stored key
   through a server route to a short-lived signed URL. Bucket stays private;
   no 4.5 MB response cap.
3. **`imageAssetId` semantics:** the **R2 object key** (durable, secret-free,
   never expires). It is stored in the document and published inside the
   frozen `panoramaIndex` artifact; resolution to a viewable URL happens at
   runtime, never at publish time (a signed URL embedded in a long-lived
   published artifact would expire and break every consumer).
4. **Existing endpoint:** `POST /api/r2-connectivity-test` is **kept as-is**
   as an infrastructure diagnostic. Ingestion logic lives in new routes.
5. **Resolve audience (plan review):** `GET /api/panorama-resolve` is public
   but strictly registry-gated — it only signs keys that exist in
   `panorama_assets` with `status='uploaded'`, so no URL can be minted
   outside the ingested panorama namespace.
6. **Migration application (plan review):** `015_panorama_assets.sql` is
   written and reviewed here, then applied by the user (no local DDL
   channel).
7. **CORS (plan review):** the bucket CORS policy is applied by the user in
   the Cloudflare dashboard from an exact allowlist JSON supplied here.
8. **Live E2E (plan review):** approved — scoped commit and production deploy
   from a clean worktree; no push to `origin/master`.

## What (WHOWHAT — plain language)

1. **Sign an upload.** An authenticated admin asks the server for permission
   to upload one panorama. The server validates the request (campus id,
   panorama id, content type, declared size), generates the object key
   itself, and returns a short-lived presigned `PUT` URL pinned to that exact
   key and content type. The client never chooses or influences the key.
2. **Upload directly.** The browser PUTs the image bytes straight to
   `navi-360`. No byte passes through Vercel, so the 4.5 MB cap does not
   apply. This requires a one-time CORS policy on the bucket allowing browser
   `PUT` from the NAVI app origins (likely a Cloudflare dashboard action —
   see Phase 6).
3. **Track the asset.** Once uploaded, the object key is recorded as the
   panorama's `imageAssetId` (and, if the evidence in Phase 5 shows it is
   required, in a new additive `015_*` metadata table). Panoramas relate to
   buildings only through Building/Floor/Area → 360 Tour → Panorama — never
   through navigation-graph nodes.
4. **Read it back.** A viewer holding an object key asks the server to resolve
   it; the server returns a short-lived presigned `GET` URL scoped to that
   key, which the image loads through directly.
5. **Prove it end-to-end.** Upload one real test image (larger than 4.5 MB)
   through the actual ingestion path, read it back through the actual
   retrieval path, and confirm the bytes round-trip.

## Success criteria

1. An authenticated admin session can obtain a presigned `PUT` and upload a
   real JPEG **larger than 4.5 MB** directly to `navi-360`; the object exists
   under the server-generated key (verified independently via the Cloudflare
   dashboard or the presigned `GET`), proving the Vercel body cap is bypassed.
2. The stored key resolves to a presigned `GET` that returns byte-identical
   content in a real browser, with no size ceiling imposed by the app.
3. No R2 credential ever appears in a response body, client bundle, log line,
   or published artifact: zero `NEXT_PUBLIC_R2_*` variables, all signing
   server-side, all errors sanitized through the existing `sanitizeR2Error`
   contract (code/status/requestId only).
4. A document panorama whose `imageAssetId` is an R2 object key compiles and
   publishes through the **frozen** `panoramaIndex` pipeline unchanged —
   existing publish/runtime tests keep passing with no contract edit.
5. Repository verification passes with no new failures attributable to this
   change: ESLint clean on touched files, new unit suites green (RED first),
   scoped `tsc`, `npm run build` — and `POST /api/r2-connectivity-test`
   still returns `401` unauthenticated and `200 {ok:true}` authenticated,
   byte-for-byte unchanged.

## Non-goals (explicitly out of scope)

- No 360° viewer, image stitching, hotspots, tour graph, or offline support
- No thumbnails, tiling, CDN configuration, or any image processing
- No integration with route nodes / the navigation graph / navigation data
- No changes to `PublishedCampus`, `panoramaIndex`, `PanoramaEntry`,
  `PanoramaService`, or any other published-data contract
- No public bucket, no `ACL`, no auth changes, no second storage provider
  (Cloudinary env vars exist but remain untouched)
- No removal, replacement, or merge of `/api/r2-connectivity-test`
- No real campus content authoring — one test object only

## Security requirements (hard constraints)

- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` remain server-side only:
  never `NEXT_PUBLIC_*`, never logged, never echoed, never committed.
- The bucket stays private; no ACL is ever set on any object.
- Presigned URLs are short-lived and narrowly scoped: `PUT` is bound to the
  exact server-generated key, TTL in minutes; `GET` is scoped to a single key,
  TTL in minutes. **Content-Type enforcement point (verified SDK fact):**
  `@aws-sdk/s3-request-presigner` hardcodes `content-type` as unsignable
  (`dist-cjs/index.js:47`), so the media type cannot live in the URL
  signature. It is therefore enforced twice elsewhere — (a) the approved type
  is validated before signing, and (b) `complete` re-reads the stored object's
  Content-Type via `HeadObject` and rejects mismatches before anything enters
  the registry; only registry entries can ever be resolved.
- **The client cannot pick the object key.** Keys are generated server-side
  from validated ids; payload fields are validated against strict patterns
  (no `..`, no absolute paths, no control characters) so a signed request can
  never target an object outside the panorama namespace.
- Server-side limits enforced **before signing**: allowed content types
  (`image/jpeg`, `image/png`, `image/webp`) and a declared maximum byte size.
- The new mutation route sits behind the existing `requireVerifiedMutationAuth`
  gate and is registered in `route-auth-wiring.test.ts`. No new or weaker
  auth mechanism.

## Technical considerations

- Presigning uses `@aws-sdk/s3-request-presigner` (a new dependency — install
  carefully, see pitfalls) alongside the existing `@aws-sdk/client-s3`.
- `src/lib/r2.ts` header (L4–7) currently forbids presigned URLs by contract;
  adopting them requires an **explicit amendment** of that comment, not a
  silent violation.
- Object-key convention (namespace, collision strategy, extension handling)
  is fixed in Phase 2 and is the single source of truth for every signer.
- Browser `PUT` to `*.r2.cloudflarestorage.com` is cross-origin, so the bucket
  needs a CORS rule allowing `PUT` (and `HEAD`/`GET` if the browser ever
  reads directly) from the NAVI origins. Without it, uploads fail in the
  browser even though the signature is valid.
- Route naming follows the existing flat kebab-case App Router convention
  (`src/app/api/<name>/route.ts`); response envelopes follow the existing
  `{ ok: … }` / `{ error, status }` style.

## Known pitfalls from ERRORS.md that apply

- **Interrupted `npm install` zero-fills `package-lock.json`** (177 all-NUL
  files on the R2 task). Never interrupt an install; run
  `npm install --package-lock-only` first, verify the lock parses as JSON,
  byte-scan new package trees before trusting lint/tsc/tests.
- **Vercel env var names are case-sensitive** (`r2_secret_access_key` vs
  `R2_SECRET_ACCESS_KEY` blocked production). Any new env var must use the
  exact uppercase name and requires a redeploy to take effect.
- **`vercel env pull` redacts credentials** — local signing is impossible;
  object verification happens via the Cloudflare dashboard or a presigned
  `GET` produced by the deployed app. Never print a credential to work around
  this.
- **New request-state guards break cookie-less route tests** — every request
  double in affected suites must gain cookie-bearing fixtures in the same
  change, and each test must prove the guard ran before any client/write.
- **Root `tsc --noEmit` sits on a pre-existing failure baseline**
  (`data-identity-comparison.test.ts`) — verification must be scoped to
  touched files, same as the R2 task (145 → 3 pre-existing errors).
- **Duplicate panorama models exist** (`route_nodes.panorama_url` legacy
  columns vs document `Panorama`); ingestion writes only the document model.
- `graphify update .` was denied by managed Windows permissions in earlier
  sessions; graph output must never be hand-edited.
