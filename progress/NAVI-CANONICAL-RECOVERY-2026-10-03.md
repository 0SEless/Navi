# NAVI canonical recovery — 2026-10-03

## 1. Executive result

Canonical branch: `release/navi-canonical-2026-10-03`. Created separately, committed and pushed without force. GitHub default changed from `master` to this branch through authenticated GitHub API (PATCH 200; independent GET 200). The application source verified by the final build is commit `2488ea57ce79d6149c629a1b500d14861e8dcce2`; the final release tip adds this report and audit evidence only. The final tip and matching origin SHA are recorded in the handoff's final-verification.json and final chat report.

Task worktree: `C:/Users/Administrator/.codex/worktrees/navi-canonical-2026-10-03/Navi`. Original dirty checkout was not edited.

## 2. Original repository state

`master` and `feature/voicecode` are unrelated wrapper histories, not modern root Next.js apps. Their `navi-next` gitlink targets an ancestor of the chosen modern app. No unrelated-history merge was performed.

| Original remote branch | Preserved tip |
|---|---|
| master | 3244020ae1b204805c3c00bc3d0ab386e8a9ac29 |
| feature/voicecode | 46fee09e26fb488940648d009b219b2cd1dc20ae |
| fix/floor-editor-persistence-2026-09-27 | bead5101fc853959f99f7aabcdba72423f48f839 |
| release/navi-phase3a1-2026-09-22 | f14b8be31c6b60ba20a472a99c0b0543c8fa45dd |
| release/navi-modern-baseline-2026-09-19 | 306d5ebec33d0064f5774a8b1cd52c7e07a616b4 |
| release/navi-auth-fix-2026-09-19 | 0b4a3b5ea7d0fb6d3378b6ea62ffcb53bef553a9 |
| recovery/deployment-provenance-2026-09-15 | 404c37bb9985c304b7aaaa89be25adf79ff59a03 |
| codex/building-creation-confirmation | a0c5f072582c6a3a111151b24808ac413503c2ea |
| codex/building-delete-persistence | 5193355b1706aa811bac7c8b151d49e706d02744 |

Relative to bead510, the phase3a1 release diverged 25/28 commits; modern baseline 25/25; auth release 25/13; delete branch 25/15. Creation confirmation is already an ancestor (22/0). Full merge bases, root trees, packages, patch-equivalence and 71 unique commit dispositions are in `reconciliation/matrix.json`; graph history is `reconciliation/ancestry.txt`.

## 3. Base selection

Selected `fix/floor-editor-persistence-2026-09-27` at bead510. It has the actual root app, the newest floor identity/authored persistence and atomic server-adoption safeguards, R2/360 contracts, and the deployment evidence supplied in the request. A fresh lockfile install and production build verified this choice independently. Missing release functionality was reconciled explicitly rather than assuming the base was complete.

## 4. Reconciliation summary

| Source | Canonical disposition |
|---|---|
| fix/floor-editor-persistence | Entire base ancestry retained, including scoped floor identity, authored payload APIs, DoorTool/manual save, guarded shared floor-plan deletion, alignment, panorama/hotspots/R2, keepalive limit, atomic server adoption and stale-session invalidation. |
| release/navi-modern-baseline | Cherry-picked 605a9de as 4d6d684 and 306d5eb as 3844780; persistent map runtime, render cache and campus scene. Persistence ancestry represented by the scoped port. |
| release/navi-phase3a1 | Manually ported final authored campus hydration, local draft/server save separation, autosave interaction gates, authored mutation intent, reload convergence, last-writer/session/recovery guards, bounded acknowledgement retries, stable legacy route projection identities and responsive road dragging. Port commit 2488ea5. |
| release/navi-auth-fix | Relevant persistence/recovery ancestry included in the same coherent final-state port. No rollback of newer floor/server safeguards. |
| codex/building-delete-persistence | Building deletion event handling, full-document authoritative reconciliation and save/reload regression coverage ported. Scoped floor updates still preserve out-of-scope data. |
| codex/building-creation-confirmation | Reachable a0c5f07 already retained; ConfirmOverlay and tests match release 92ac9f0 exactly. |
| recovery/deployment-provenance | Runtime closure already represented: every affected application path exists in base; dependency/export closure reviewed. Recovery history preserved. |
| master / feature/voicecode | NAVI gitlink target already an ancestor; unrelated Python VoiceCode/tooling and historical wrapper documents remain on original branches. |

Exact skipped-commit reasons:

- 92ac9f0: duplicate creation confirmation; source and test diff is empty against retained a0c5f07 implementation.
- 0b4a3b5: historical workflow closure documentation superseded by this canonical audit; original documentation remains on the source branches.
- 404c37b: obsolete deployment closure would restore older app code. Current source closure is represented; its only missing files, debug-fiber.mjs and test-undo-redo.mjs, are standalone historical diagnostics with no runtime role.
- Every unrelated master/voicecode commit is individually recorded in matrix.json. Those commits affect Python tray/transcriber tooling or wrapper history; the required NAVI application ancestor is already retained. Preserved original branches avoid discarding that work.
- Historical intermediate persistence implementations were superseded by the reviewed final release state in the manual port. Their relevant behavior/tests are retained, with explicit newer atomic-adoption/floor safeguards. The matrix records every source SHA and affected path.

No compiler/core topology redesign was introduced. The imported strict production-road edge-count fixture remains intact even though it fails in the untouched baseline.

## 5. Build verification

- `npm ci --no-audit --no-fund`: exit 0, 842 packages installed.
- `npm run build`: final exit 0. Invoked through native Node/npm CLI with seven existing NEXT_PUBLIC inputs supplied only to the child process; no env file copied into the branch and no values printed. Clean environment without those public inputs fails prerendering as expected.
- Production `npm run start -- --hostname 127.0.0.1 --port 3217` started successfully. Task server stopped after read-only smoke verification.
- Next config already sets `typescript.ignoreBuildErrors: true`. Build success does not certify TypeScript. `tsc --noEmit` encounters the unchanged baseline missing-brace error at packages/runtime/src/__tests__/data-identity-comparison.test.ts:255.
- Operational scoped lint reports the same 14 pre-existing refs/legacy-any errors as exact bead510 source at the same file paths. No added lint finding in the scoped comparison. Complete repository lint is not certified.

Evidence: install.log, final-build.log, port-types.log, lint-comparison.json, runtime-smoke.json.

## 6. Test verification

| Run | Result |
|---|---|
| Untouched bead510 full Vitest baseline | 6071 passed, 34 failed, 8 skipped; exit 1; 3 collection failures separately |
| Canonical complete configured suite (`npm test -- --maxWorkers=6`) | 6188 passed, 34 failed, 8 skipped; exit 1; same 3 collection failures |
| Final store/editor selection after source tidy | 219 passed, 1 known baseline fixture failure; exit 1 |
| Map cache / persistent scene selections | 27 / 34 passed; exits 0 |
| Publisher omitted by root config, explicitly selected with Node environment | 110 passed, 0 failed; exit 0 |

Failure classification: 33 identical baseline assertion failures; one imported historical production-road fixture independently reproduces against the unchanged bead510 GraphAdapter (expected 3 redundant edges, actual 0). That fixture is a KNOWN BASELINE FAILURE, not an introduced regression. The baseline floor-plan deletion-guard assertion now passes. All 34 assertion failures and three collection failures are recorded individually in failure-classification.json.

TEST INFRASTRUCTURE FAILURES: two missing golden-campus imports and unchanged routing fixture setup fail collection in both baseline and canonical. Publisher's two cross-realm Uint8Array equality failures under jsdom disappear in the appropriate Node environment without source changes.

No new functional regression found in the executed suites. This is not a fully green suite or complete routing certification. Temporary baseline diagnostic source files were removed before committing; raw diagnostic evidence retained.

Runtime GET evidence: `/`, `/map/explore`, `/map/navigate` return 200; `/studio` and floor-editor route return 307 to `/login`; graph/panorama invalid GETs return 400. No immediate fatal response. Authenticated Studio editing remains unverified without a signed-in localhost session. No production writes were performed.

## 7. Application structure

Verified freshly fetched origin tree has root package.json, package-lock.json, next.config.ts, tsconfig.json, src/ and public/. Package `navi`, npm workspaces `packages/*`, Next.js 16.2.9, React 19.2.4. Build/start scripts are `next build` and `next start`. The default branch exposes the actual application rather than a nested gitlink wrapper.

## 8. Hostinger readiness

Repository root is structurally ready for Hostinger Next.js detection after the verified default switch. The stale-master structure cause is removed. Actual hPanel import/detection and deployment are unverified; environment configuration was not changed. A runnable deployment will require its normal environment inputs, as the clean baseline build demonstrated.

Official references checked: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/ and https://www.hostinger.com/support/fix-failed-to-build-application-error-hostinger-node-js/ . These support the root framework/package structure requirement; they do not prove an actual import occurred.

## 9. Safety confirmation

No force pushes, resets, history rewrites, deleted branches/tags/worktrees, stash, or production database writes. All nine original remote tips are identical. All original worktrees remain. Primary branch and HEAD are unchanged; complete porcelain snapshots match exactly (12,940 entries). Generated previews/test output/graph caches remain local evidence, outside the committed application source. Full raw evidence is preserved in the task worktree and copied to the task's visualization evidence directory.

## 10. Remaining actions

No manual GitHub default-branch action remains. Hostinger's actual import remains to be exercised in hPanel; this task establishes repository readiness, not production deployment. Existing baseline assertions, collection failures, TypeScript parse error and authenticated Studio acceptance remain documented limitations. Final remote verification JSON records the final release tip after this documentation commit.
