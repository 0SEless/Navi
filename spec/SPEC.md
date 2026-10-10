# SPEC: Floor Editor Door & Interior Persistence Across Reload and Tab Close

## Phase P3A: Development-Only Test Campus Catalog Resolution

### What
Make the existing disposable development persistence campus resolvable by its editor route without adding it to the shared or browser-persisted normal Studio map catalog.

### Success criteria
1. The overlay is disabled unless the build/runtime is development, the configured Supabase URL identifies `scvgulusmutnzasmgysx`, and the isolated browser explicitly opts in for `navi-persistence-test-1791537831751-m7ckux03`.
2. Only the exact test campus ID can resolve through the overlay, using a valid `CampusMap` value stored separately from the normal catalog.
3. Server catalog entries keep precedence and remain unchanged; refreshes do not prevent the exact test editor route from resolving.
4. The overlay never enters normal `campus-map-store` synchronization or `/api/campus-maps` writes, and production cannot activate or display it.
5. Focused tests prove the gates and isolation before browser persistence certification resumes.

### Applicable pitfalls
- `ERRORS.md` records save attribution, cross-scope preservation, and unload persistence risks. Keep this change out of graph save/store behavior; do not call a UI save successful without server acknowledgment.

## 1. Context & Purpose
When users place a door (or any interior entity such as walls, rooms, routes) in the Floor Editor, changes fail to persist to the server when the user closes the URL/tab and reopens it. The user sees their door wiped out or replaced by the server version with a conflict banner. Additionally, on production deployment, `src/store/graph-store.ts` was omitted from a recent commit, causing `TypeError: setAuthoredDocument is not a function` which crashes the editor on load.

## 2. What Needs to Happen (WHAT, not HOW)
1. **Floor Editor Door Creation & Persistence**: Placing a door in the Floor Editor (`door.create`) must reliably update both local cache and Supabase backend with `floor.doors` and graph projection `doors`.
2. **Tab Close / Page Unload Persistence**: When the user closes the tab, navigates away, or unloads the page after placing a door, the save network request to `/api/graph` must not be aborted mid-flight by the browser (`keepalive: true`).
3. **Continuous Mutation Attribution in Floor Editor**: The Floor Editor must record authored mutation intent (`recordAuthoredMutation('floor', buildingId, floor)`) on `document.changed` so any save (autosave, manual, or unload flush) passes the P0.11 safety guard.
4. **Manual Save Trigger in Floor Editor**: The Floor Editor must provide an explicit Save action (and `Ctrl+S` shortcut) with clear status feedback (`Saved`, `Saving...`, `Sync failed`), giving users direct control over when work is persisted to the server.
5. **Clean Production Hydration**: All store methods (`setAuthoredDocument`, `authoredDocument`, serialization) must be committed and deployed, preventing runtime `TypeError` crashes on Vercel.
6. **No Conflict Banner on Reopen**: Reopening the Floor Editor after closing must cleanly load the server-persisted door without false conflict warnings or state erasure.

## 3. Concrete Success Criteria
1. `src/store/graph-store.ts` is committed and cleanly passes tests and typechecks without missing store methods.
2. `performSyncToSupabase` in `src/store/graph-store.ts` uses `{ keepalive: true }` in `fetch('/api/graph', ...)` so in-flight requests survive page unloads.
3. `FloorEditorBridge` records authored mutation intent on `document.changed`.
4. `FloorEditor.tsx` provides a manual Save button and `Ctrl+S` hotkey wired to `workflow.save('manual')`.
5. Automated test verifies: place door -> save -> reload from server -> door exists on both server `authored_document.buildings[...].floors[...].doors` and graph snapshot.

## 4. Known Pitfalls from ERRORS.md
- **2026-09-27**: Save-boundary intent injection defeated the P0.11 unattributed-mutation guard. Fallback must require real document changes (`document.version > 0`).
- **2026-09-27**: Cross-scope destructive save blocked. Always keep scopes distinct and preserve entities outside the active floor.
- **2026-09-27**: Hardcoded keys in verification scripts. Read keys from environment variables only.
- **2026-09-25**: Bulk text replaces can drop parentheses or variable declarations. Verify with targeted checks.
# Phase P3B — Development Studio Graph Write Authentication

## What
Resolve the development Studio `POST /api/graph` HTTP 401 only if the rejection cause is demonstrated from the request/authentication path. Preserve production authentication and authorization, and perform UI persistence checks only with an authorized development session against the existing disposable campus.

## Success criteria
- Identify the exact 401-producing branch and establish whether it matches the browser request.
- Keep mock authorization explicitly opt-in and unavailable in production; do not weaken verified-user/admin checks.
- Add focused regression coverage for the confirmed cause and repair.
- If a legitimate development session can be established, verify Map and Floor Editor saves by server acknowledgement and fresh readback; otherwise stop without writes and report the exact required operator action.

## Applicable ERRORS.md pitfalls
- Preserve P0.11 authored-intent checks; never synthesize mutation authorization.
- Treat a save as successful only after server acknowledgement and cold authoritative readback.
- Do not infer browser cookie state from source code or from a successful GET.

## Phase P4: Floor Editor Room Name Persistence

### What
Ensure a room-name edit made through Floor Editor becomes part of the correct authored floor document, is included in the graph persistence payload, and is reported saved only when the server acknowledges that intended content.

### Success criteria
1. The room-name control updates the authored room identified by the selected canonical floor ID and room ID.
2. The save payload contains that updated authored floor while preserving all other floors.
3. A successful save state requires an acknowledgement whose committed content matches the intended room edit; failed or mismatched saves remain recoverable and unsaved.
4. Focused regression tests prove room identity, floor isolation, payload content, and acknowledgement behavior without weakening Map Editor behavior.
5. The existing disposable development campus passes a real UI save, authoritative readback, cold reload, and Floor B isolation check; the original pending browser state remains preserved.

### Applicable pitfalls
- Prevent false “Saved” state when HTTP transport succeeds but committed content does not match.
- Preserve authored mutation attribution and fail-closed destructive-save protection.
- Preserve canonical floor/room identities and do not let one floor overwrite another.
- Keep P3B browser recovery state untouched; use a fresh isolated browser origin for verification.
- Keep all writes scoped to the existing disposable development campus; never access Production.

## Phase P5: Preserve Verified Persistence Repairs

### What
Preserve only verified Map/Floor Editor persistence and authentication repairs on the isolated candidate branch, while excluding temporary development catalog registration and browser workarounds from the commit.

### Success criteria
1. Every dirty file is classified, with production-safe fixes, regression tests, development-only infrastructure, and documentation separated.
2. Production authentication remains fail-closed; mock fallback is explicit, development-only, and unavailable in production.
3. The Strict Mode regression proves a discarded Floor Editor context cannot initialize autosave services.
4. Focused tests, lint, typecheck, and `git diff --check` results are reported with baseline failures distinguished.
5. A local commit contains only the reviewed auth and Floor Editor repairs/tests; no push or deployment occurs.

## Phase P6D: Durable Panorama Scene Images

### What
Panorama scenes authored in NAVI Studio use the existing authenticated upload API to store image bytes in the dedicated development R2 bucket, keep only a canonical `Panorama.imageAssetId` object key in the authoritative campus document, and resolve that key to a short-lived URL when Pannellum renders it.

### Success criteria
1. Upload accepts only viewer-compatible equirectangular JPEG, PNG, or WebP images within the server byte limit and gives visible progress and failure state.
2. Each new upload receives a unique immutable key; it is not marked ready or attached to a scene until R2 completion verification succeeds.
3. The scene's stable ID, location, hotspots, and all unrelated document content are preserved by the existing authoritative save contract.
4. Studio preview and public Pannellum paths resolve registered keys at render time; ephemeral signed URLs are never persisted.
5. Focused tests pass and a development-only browser upload, authoritative readback, cold reload, and Pannellum render succeed on the designated disposable campus; no Production or other development campus is touched.

### Applicable ERRORS.md pitfalls
- Defer browser-only state until after hydration; do not read browser storage during the server/first-client render.
- Treat saves as successful only after server acknowledgement and authoritative readback.
- Keep editor state and autosave scoped to the retained mounted context; avoid stale background writers.
- Keep mutations scoped to the exact disposable development campus and never use Production configuration.

## Read-only diagnostic: development Studio admin redirect

### What
Determine why a signed-in development user is redirected from `/studio` to `/` while preserving authorization boundaries and making no account or database changes.

### Success criteria
1. Confirm the running local app targets only development Supabase.
2. Trace middleware and API admin checks to their shared role-resolution rule.
3. Verify whether the development account has an accepted server-side admin claim, using aggregate-only evidence.
4. Identify the redirect condition and state the smallest operator-controlled correction without applying it.

### Applicable ERRORS.md pitfalls
- A client-side role or development mock state is not server authorization.
- Do not infer a valid admin role from successful sign-in; verify the server-side claim used by middleware and APIs.
- Keep this diagnosis read-only and never access Production.

## Phase P6E: Restore Development Admin Authorization

### What
Restore Studio access for the intended existing Development Auth user only after the user's stable Auth ID and authorization for the role change are verified.

### Success criteria
1. Runtime and all admin operations target only `scvgulusmutnzasmgysx`.
2. The intended existing Auth user is identified by stable ID from a live, legitimate Development session.
3. Only `app_metadata.role` is changed to `super_admin`, preserving every other metadata field, and only when authorized.
4. A fresh sign-in opens Studio; authorized API access succeeds while unauthenticated and ordinary users remain denied.
5. No Production, other user, source file, or R2 configuration is changed.

### Applicable ERRORS.md pitfalls
- Do not map a dashboard identity to an app identity without evidence.
- Do not update roles based on stale sessions, client metadata, or mock auth.
- Privilege changes must stop when the target Auth user ID is uncertain.

## NAVI Phase P6D — Panorama Persistence Verification (2026-10-10)
Success means the approved candidate's authenticated Studio can upload an image to Development R2, register the asset, persist the scene, then resolve and render it after cold reload without changing unrelated campuses or touching Production.

## NAVI Phase P6F — Restore local Next.js routing (2026-10-10)
Success means the exact approved candidate serves its public routes, sends unauthenticated admin-route requests through the login redirect, and allows the existing legitimate Development admin session to open Studio and Panorama Management without source, auth, database, or R2 changes.

## NAVI Phase P6H — Dataset and Panorama UI regression audit (2026-10-10)
Success means the prior approved visual design for Dataset Management and Panorama Management is identified from reliable repository or screenshot evidence, then restored with only minimal UI changes while retaining canonical panorama persistence and dataset functionality. If approval evidence is unavailable, stop without inventing a design or changing source.

## P6I — Controlled UI and persistence reconciliation

Restore campus-first Dataset Management and the richer canonical Panorama scene-management workspace on the persistence candidate. Keep the dataset’s legacy tools reachable at a separate route, preserve the candidate’s acknowledged document and panorama asset contracts, and keep all edits out of the UI source worktree.

Success criteria:
1. `/dataset` selects a campus; `/dataset/[id]` renders its campus/building/outdoor hierarchy and Information, Images, Dataset, and read-only 360 tabs.
2. Legacy export/import/validation/backup tools remain reachable at a separate route.
3. Sidebar highlighting identifies the top-level route for nested pages.
4. Panorama Management provides its scene inventory, search/filter, details, empty states, and Studio navigation while using canonical `Panorama.id` / `imageAssetId` and the candidate’s existing signed resolver and Pannellum viewer.
5. Focused checks pass; no claim of Panorama end-to-end persistence is made without an actual browser upload and authoritative cold reload.

Applicable error-ledger safeguards: defer browser-only state until hydration; verify candidate-owned routes/processes rather than a different worktree; keep panorama image keys durable and resolve signed URLs only for rendering; never treat the dev mock session as write authorization.
