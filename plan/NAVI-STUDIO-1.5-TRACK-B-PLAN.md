# NAVI Studio 1.5 Track B Implementation Plan

> **For agentic workers:** Execute the tasks in order using TDD. Check the matching TODO and progress ledger before resuming.

**Goal:** Add recoverable local Studio drafts behind a development-only default-off flag while preserving existing cloud save behavior and preparing safe cloud follow-up work.

**Architecture:** Keep the current Graph/AuthoredDocument model and existing cloud writer. Store one latest full reconstructable draft per campus in IndexedDB, with document identity, scope, format version, content checksum, timestamps, and base server revision. Intercept only automatic persistence in development when the flag is enabled; keep explicit manual server saves on the existing guarded writer. Store draft status separately from cloud sync status.

**Tech Stack:** Next.js, TypeScript, Zustand, IndexedDB, Vitest/jsdom, existing Graph and `CampusDocument` serialization.

**Spec:** `spec/NAVI-STUDIO-1.5-TRACK-B-SPEC.md`

## Global Constraints

- Candidate worktree only: `.navi-worktrees/navi-studio-1.5-track-a-20261027`.
- Feature flag: `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS`; effective only when `NODE_ENV === 'development'` and exactly `'true'`; default false.
- No cloud configuration, cloud writes, database changes, migrations, publication, deployment, Production credentials, or paid resource creation.
- Preserve CAS, idempotency, server revision acknowledgment, and conflict behavior.
- No code changes to the original dirty application or parent checkout.
- No full production build unless dependencies are ready and disk remains above the 5 GiB floor.

## Review Focus

1. Rapid edits during an in-flight IndexedDB write must leave the newest draft recoverable (test: later version is the record after debounced writes settle).
2. A draft from a different campus/building/floor must never be adopted into the active document (test: switch campus and verify distinct IDs/records; floors remain in the same authored campus document).
3. A checksum/schema mismatch must preserve the record and refuse automatic reconstruction (test: corruption is surfaced without deleting data).
4. A stale base server revision must not be auto-pushed or silently replace the server (test: restore draft as a conflict and no cloud request occurs).
5. Feature-flag-off and production builds must preserve existing cloud autosave (test: feature gate false for production and disabled dev).

---

### Task 1: Verify the selected feature baseline

**Files:** Read existing source/tests; create `reports/navi-studio-1.5-track-b/01-FEATURE-BASELINE.md`.

- [ ] Compare the 13 requested capabilities to source and targeted existing tests; install dependencies only after disk/lock checks.
- [ ] Run the relevant existing baseline tests; record exact commands/results and any inherited failures.
- [ ] Mark every capability `present+test-verified`, `source-only`, `missing`, `regressed`, or `undetermined`; no browser claims.

**Acceptance:** matrix complete and all pre-existing failures are captured before code edits.

### Task 2: Prepare environment, backup, and security plans

**Files:** Create `02-DEVELOPMENT-ENVIRONMENT-PLAN.md`, `03-BACKUP-RESTORE-PROCEDURE.md`, `04-SECURITY-REPAIR-PROPOSAL.md`.

- [ ] Trace exact candidate client/server key variables, deployment guards, auth callbacks, and R2 calls.
- [ ] Write exact variable names/scopes and fail-closed rules, with no secret values.
- [ ] Write a logical backup/restore runbook that includes PostgreSQL, roles/extensions, Auth, Storage, checksums, isolation, and verification.
- [ ] Draft reviewed `published_maps` privilege/RLS SQL and rollback; assess `spatial_ref_sys` separately. Do not execute SQL.

**Acceptance:** plans are actionable, preserve public reads/admin publishing, and specify all unresolved external approvals.

### Task 3: Add the local draft record store

**Files:** Create `src/services/studio-local-drafts.ts`, `src/services/studio-local-drafts.test.ts`; use existing `src/services/authored-snapshot-persistence.ts` and `src/services/snapshot-sha256.ts` only if present and compatible.

- [ ] Test stable `draftId`/campus identity and versioned record construction.
- [ ] Test IndexedDB put/get/delete round trips, deterministic checksum verification, schema rejection, and storage errors.
- [ ] Implement one latest reconstructable Graph + authored-document record per campus; include captured building/floor scope and base server revision.
- [ ] Test corrupted checksums and unsupported schema versions are reported without deleting or adopting the record.

**Acceptance:** service is browser-only, mockable in tests, one record per campus, does not use localStorage for campus payloads, and validates before reconstruction.

### Task 4: Integrate draft state and feature gate in GraphStore

**Files:** Modify `src/store/graph-store.ts`; create/modify focused `src/store` tests.

- [ ] Test flag evaluation: enabled only in development with the exact opt-in value.
- [ ] Test autosave trigger writes local draft and makes zero `/api/graph` requests when enabled.
- [ ] Test manual trigger still uses the existing writer, and flag-off requests retain existing behavior.
- [ ] Add distinct local-draft state/actions; persist/load/recover a validated draft without treating it as server-acknowledged.
- [ ] Preserve newer edits when async write/restore/save settles; preserve conflict and server-adoption semantics.

**Acceptance:** default/production behavior is unchanged, draft status is separate from `syncStatus`, and stale base revisions are surfaced without a cloud write.

### Task 5: Wire local edits, status, and safe lifecycle flushes

**Files:** Modify `src/components/studio/EditorBridge.tsx`, `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx` only if caller tracing proves necessary, `src/components/studio/SaveStatus.tsx`, `src/components/studio/save-status-model.ts`, and `src/components/floor-editor/FloorEditor.tsx` if it owns the visible status; add focused tests.

- [ ] Test debounced local scheduling on document change, floor/building identity capture, and no-op suppression.
- [ ] Name every automatic caller explicitly (`autosave`, visibility, unload, online recovery) so none inherits the manual-cloud default.
- [ ] Wire `Unsaved changes`, `Saving locally`, `Saved locally`, and `Local save failed` without labeling local state cloud-saved.
- [ ] Ensure visibility/pagehide flush best-effort IndexedDB only in enabled mode; no cloud request from automatic handlers.

**Acceptance:** Studio and Floor Editor statuses distinguish local durability from cloud acknowledgment; all automatic callers are covered by tests.

### Task 6: Run the local recovery regression matrix

**Files:** Modify focused tests only as needed; create `reports/navi-studio-1.5-track-b/05-LOCAL-DRAFT-IMPLEMENTATION.md` and `07-TEST-RESULTS.md`.

- [ ] Cover edit/reload, floor and building switches, offline, IDB quota/error, corrupt draft, interrupted write, no cloud autosave, flag-off behavior, no-op suppression, stale acknowledgment, and restart where test infrastructure supports it.
- [ ] Run focused unit tests, targeted TypeScript, targeted lint, then the full test command. Record baseline failures separately.
- [ ] Run production build only if dependencies are installed and at least 5 GiB remains; otherwise mark it not run.
- [ ] Recheck original repositories remain unchanged and candidate diff is scoped.

**Acceptance:** every result is actual output; no browser or cloud PASS is claimed without a permitted isolated environment.

### Task 7: Plan scoped cloud persistence and close Track B

**Files:** Create `06-SCOPED-PERSISTENCE-NEXT-PHASE.md`, `08-RISKS-AND-APPROVALS.md`, `00-TRACK-B-SUMMARY.md`; update `progress/PROGRESS.md`, `errors/ERRORS.md`, and TODO.

- [ ] Define scoped save contracts for building, terrain, routes, and campus settings, compact revisions/checkpoints, cross-domain validation, additive migration needs, synthetic campus, and publication compatibility.
- [ ] Document changed files, preserved behavior, tests, limitations, and rollback.
- [ ] Verify all nine required reports and workflow logs; stop before any external changes.

**Acceptance:** local candidate behavior is tested and reported; all cloud/restore/security approvals remain explicit and no cloud operation occurred.
