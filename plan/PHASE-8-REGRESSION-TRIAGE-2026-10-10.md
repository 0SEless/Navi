# Phase 8 Plan — Regression Triage and Stabilization

## T8.1 — Verify and preserve current state

- **Description:** Verify branch/HEAD, status, Playwright artifacts, compiler snapshot, and exact test commands/configuration. Record the literal-path mismatch and use only the existing matching branch/HEAD worktree.
- **Files:** Workflow records only; current source/artifacts are read-only.
- **Acceptance:** No source or artifact is changed; current dirty paths and snapshot blob identity are recorded.
- **Error prevention:** Avoid treating generated results or a CRLF-only snapshot marker as source changes.

## T8.2 — Reproduce integration test failures

- **Description:** Rerun the full local Vitest suite with external service variables blank and preserve output in a new ignored cache log.
- **Files:** Generated log under `node_modules/.cache` only.
- **Acceptance:** Nonzero collected suite and exact failing test names/assertions are captured.
- **Error prevention:** Use worktree-local `TEMP`/`TMP`; do not invoke live Supabase, R2, Cloudflare, Vercel, or Production services.

### T8.2 evidence

- Command: `vitest run src packages --reporter=dot` from the integration worktree, with Supabase, PostgreSQL, R2, Cloudflare, Vercel, mock-auth, and Mapbox variables blanked in the process.
- Result: 595/630 test files passed; 6,524 passed, 67 failed, 8 skipped; exit 1. Duration: 164.53 seconds.
- The same 35 failing files and 67 failing test names recurred in the saved Phase 7 run. Full output is preserved in ignored `node_modules/.cache/phase8-integration-vitest-5ffe396b5f204edba58bbbd2e6e4b694.log`.
- First launch stopped at its output-path guard before creating files; the corrected run completed. See the matching `ERRORS.md` entry.

## T8.3 — Compare against clean recovery checkpoint

- **Description:** Create a detached baseline at `322db38672147b7ec16a7d97b14a4674641c6931`, run comparable failures under equivalent settings, and inspect test ancestry for tests absent at that checkpoint.
- **Files:** Retained isolated baseline worktree with independently installed ignored dependencies; per-test evidence matrix in plan/PHASE-8-FAILURE-MATRIX-2026-10-10.md.
- **Acceptance:** Each failure is classified with direct baseline evidence or remains unresolved; baseline is retained if cleanup could discard work.
- **Evidence:** Baseline: 589/625 files passed; 6,502 passed, 68 failed, 8 skipped. All 67 integration failure identifiers recur at baseline; the baseline-only panorama immutable-key assertion was corrected in Phase 5. See plan/PHASE-8-FAILURE-MATRIX-2026-10-10.md.
- **Error prevention:** Do not assume the older persistence base contains all integration tests; do not share dependency resolution with the integration worktree; do not modify the candidate or donor.
- **Status:** Complete. Detached baseline retained at C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-phase8-baseline-322-20261010 at 322db38672147b7ec16a7d97b14a4674641c6931. It was rerun with independently installed offline dependencies after a shared-dependency junction contaminated the first attempt.

## T8.4 — Repair confirmed regressions

- **Description:** Fix only failures proven new by comparison, in small feature-scoped batches.
- **Files:** Only source/test files implicated by a confirmed integration regression, plus workflow records.
- **Acceptance:** Targeted and neighboring tests pass; reviewed diff is scoped; local commit contains verified repairs only.
- **Error prevention:** Read errors/ERRORS.md before edits and do not weaken auth, persistence, or tests to fit stale expectations.
- **Status:** Complete. The optional-traces metric fix and focused verification are complete; it is included in the scoped local checkpoint described in the final report.
- **Evidence:** Full-suite failures are unchanged from the baseline. The focused public-store, Map/Floor/auth, and Dataset/Panorama/public-runtime suites pass 39/39, 145/145, and 694/694 respectively.

## T8.5 — Compare static checks and final verification

- **Description:** Compare lint and TypeScript findings with the same clean baseline, retry build only with a safe Development configuration if available, and run applicable regressions.
- **Files:** Workflow records and any confirmed repair files only.
- **Acceptance:** Exact command outcomes, final suite totals, baseline deltas, branch status, and remaining R2/browser gate are reported.
- **Error prevention:** Never call a failed compile/build green; do not invent public Supabase settings or use Production credentials.
- **Status:** Complete; repository verification remains blocked at the build and live Development-storage gates.
- **Evidence:** Final suite remained 595/630 files, 6,524 passed, 67 failed, 8 skipped. ESLint: 4 errors/4 warnings versus baseline 5/5, with no new findings. TypeScript: 1,145 diagnostics versus baseline 1,159, with no new findings. Build compiled but failed prerendering /demo/navigate because public Supabase variables were intentionally absent; result is BLOCKED. git diff --check passes. Required graphify update failed with the uv trampoline path canonicalization error; graph output was not modified.
