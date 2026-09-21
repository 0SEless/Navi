# Building creation confirmation / duplicate Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a building footprint Save commit once, close the confirmation, reset the drawing session, and remain retryable without duplicate buildings when persistence fails.

**Architecture:** Keep `ConfirmOverlay` on the existing editor dispatcher and `workflow.save('manual')` path. Use a synchronous component ref as the double-submit gate and retain one generated building ID plus a committed flag for the lifetime of one confirmation. Finalize only after the existing workflow save resolves; the existing `ConfirmOverlayAdapter` then drives the canonical drawing-session reset.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest, Testing Library, existing `@navi/editor` dispatcher/workflow services.

**Spec:** `navi-next/spec/NAVI-BUILDING-CREATION-CONFIRMATION.md`

## Global Constraints

- Scope is `src/components/studio/ConfirmOverlay.tsx` and focused confirmation tests.
- The existing workflow/autosave/sync pipeline remains the only persistence path.
- Do not change sync timing, save queues, CAS, recovery, schema, publishing, or delete persistence.

## Review Focus

- Rapid double click: only one dispatcher call while the first workflow save is pending (Task 1).
- Workflow rejection after a successful command: confirmation remains and retry does not dispatch another building (Task 1).
- Dispatcher rejection: draft remains, an error is visible, and a later retry can commit (Task 1).
- Cancel: no create command and both legacy draft/confirmation clear actions run (Task 1).
- New confirmation after success: a second intentional building is accepted (Task 1).

---

## Task 1: RED lifecycle tests

**Files**

- Modify: `navi-next/src/components/studio/__tests__/ConfirmOverlay.test.tsx`

**Errors to prevent**

- A browser confirmation probe can miss the active control; tests must use the rendered Save/Cancel buttons and assert command calls.
- Persistence failures must stay in the existing workflow boundary; the test must reject `workflow.save` without introducing a second persistence mock.

**Acceptance**

- Tests cover one building Save, rapid double Save, Save while pending, successful reset, Cancel, failed persistence with retry, and two intentional buildings.
- The new tests fail against the current handler because there is no synchronous submit lock and no building retry identity.

**Steps**

- [x] Add building Save/Cancel, double-submit, pending-save, command-failure, persistence-failure, and second-confirmation assertions to `ConfirmOverlay.test.tsx`.
- [x] Run `npm test -- --run src/components/studio/__tests__/ConfirmOverlay.test.tsx` and observe the expected RED failures before production changes.

## Task 2: transactional Save/finalization

**Files**

- Modify: `navi-next/src/components/studio/ConfirmOverlay.tsx`

**Errors to prevent**

- Do not clear pending points before the create command succeeds.
- Do not add a second server save path or change autosave/sync behavior.
- Do not let a failed save retry dispatch a second building ID.

**Acceptance**

- A ref-backed in-flight guard disables Save synchronously and displays `Saving...` while the existing workflow save is pending.
- Building IDs and the committed-building flag are stable for one confirmation; retries after a persistence failure retry the existing workflow save without dispatching another create.
- Only a successful command + workflow save calls the canonical legacy clear actions (`clearDrawPoints`, `clearPendingConfirm`), allowing `ConfirmOverlayAdapter` to call the drawing session cancel/reset transition.
- Errors are caught, shown, and leave the confirmation/draft open with Save enabled again.
- Cancel behavior and route/area/boundary/import behavior remain scoped and unchanged except for the shared lock/error/finalization guard.

**Steps**

- [x] Add `saving` state plus a ref guard and disable both confirmation actions while the first Save is pending.
- [x] Keep one generated building ID and committed flag for a confirmation; skip create dispatch on persistence retry.
- [x] Catch commit/workflow errors, render the retryable failure, and clear confirmation only after awaited success.
- [x] Run the focused confirmation suite and scoped ESLint.

## Task 3: focused verification and ledger

**Files**

- Modify: `navi-next/progress/PROGRESS.md`
- Modify: `navi-next/errors/ERRORS.md` only if a new error is encountered

**Acceptance**

- Focused Vitest suite passes with explicit file/test counts; scoped lint/diff checks pass.
- Production build passes without touching protected sync architecture.
- Run `graphify update .` after edits; if the known Windows access failure recurs, record it and leave generated graph output untouched.

**Steps**

- [ ] Run the adjacent Studio confirmation/drawing suites, production build, and scoped diff checks.
- [ ] Update `navi-next/progress/PROGRESS.md`; append only newly observed failures to `navi-next/errors/ERRORS.md`.
- [ ] Run `graphify update .` and record the result.

## Task 4: commit, push, deploy, provenance

**Files/state**

- Commit only the focused source/test/docs changes in `navi-next`.

**Acceptance**

- Commit SHA is reported; no force push.
- Push the focused commit to the current working branch/remote without overwriting newer remote work.
- Deploy the exact pushed SHA to the existing Vercel project, verify READY, HTTP 200, alias, and deployed SHA where provider provenance is available.
- If authenticated production smoke is unavailable, report the exact manual smoke checklist from the request.

**Steps**

- [ ] Commit the focused changes with `fix(studio): finalize building footprint after save`.
- [ ] Push without force and deploy the exact pushed SHA.
- [ ] Verify READY, HTTP 200, alias, and deployment provenance; report manual owner smoke if authentication is unavailable.
