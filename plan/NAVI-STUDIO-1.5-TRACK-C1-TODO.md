# NAVI Studio 1.5 — Track C1 TODO

- [x] T1 — Diagnose and minimally repair the TS1005 syntax defect; the runtime suite parses but is marked skipped (61 skipped). Full TypeScript remains inherited debt (1,128 diagnostics versus 1,129 baseline). See C1 logs.
- [x] T2 — Reconcile the `useFloor` and `useBuildingFloors` exports; the public-barrel hook tests and all editor context tests pass (12 files / 153 tests).
- [x] T3 — Establish a localhost-only mocked browser harness with synthetic data and external-request blocking; all nonlocal requests are blocked and the only additional local bootstrap response is `{ maps: [] }`.
- [x] T4 — Run browser draft/recovery, lifecycle, failure, manual-save, process-restart and feature-flag scenarios; enabled mode passed 6 with 1 flag-off skip, and the separate disabled-mode run passed 1/1.
- [x] T5 — Run final focused regressions, scoped lint/build checks, write all seven C1 reports, update the error/progress logs and Graphify, then stop. Local build passed; TypeScript remains partial and no external action was taken.

Exactly one task is in progress at a time. This Markdown TODO is used because no `todowrite` tool is available in the session.
