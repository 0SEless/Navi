# Track E5 Implementation Plan

**Goal:** Verify the E4 schema and real adapter against an isolated synthetic PostgreSQL 17 target, only after explicit approval of service startup/provisioning/SQL actions.

**Spec:** `spec/NAVI-STUDIO-1.5-TRACK-E5-SPEC.md`

## Constraints

- Preserve branch `codex/navi-studio-1.5-track-a-20261027`, HEAD, D6 archive, and all existing dirty changes.
- No Supabase or real campus data. No application route wiring, deployment, push, or merge.
- No Docker/WSL startup, database/role provisioning, or SQL execution before approval.
- Never modify or delete unrelated Docker/database resources. No install, factory reset, prune, or broad cleanup.

## Tasks

### T1 — Preflight and inventory (complete with blocker)
Verify backup/Git state; inspect E4 reports, SQL and harness; inspect local tool/service/port/disk state; query Graphify and note stale results. The owner restored Docker and an elevated read-only inspection obtained current inventory. `docker info` still reports one running container while `docker ps` is empty and `docker ps -a` shows only D2 exited; reconcile before provisioning. No resource was changed.

### T2 — Local harness identity and fixture hardening (complete)
Make synthetic target identity explicit and validate seed checksums against the schema constraints. Acceptance: focused source-only regression is red before and green after the fix; no database connection.

### T3 — Approval package (in progress)
Record exact planned Docker/Compose resources, database/role/loopback endpoint, resource inventory limitation, estimated disk, preservation, cleanup, and workload impact. Acceptance: present package and wait for explicit authorization before external state changes.

### T4 — Isolated PostgreSQL 17 setup and SQL gate (approval required)
After approval, re-inventory Docker after any authorized startup, verify target ownership/identity, provision only the approved dedicated synthetic target, and run migration/SQL ACID harness. Acceptance: actual database assertions and preserved logs.

### T5 — Real TypeScript adapter integration (approval required)
Add test-only `pg` binding, run synthetic adapter cases, and make only minimal test-backed fixes. Acceptance: real independent DB state assertions; no app routes.

### T6 — Synthetic dump/restore and recovery (approval required)
Hash custom dump, verify readability, restore to approved empty synthetic target, compare counts/fingerprints/history/reconstruction. Acceptance: byte-independent logical integrity checks and scoped cleanup.

### T7 — Regression verification
Run E4/scoped regressions, real integration tests if authorized, ESLint, TypeScript baseline comparison, route isolation, and diff check.

### T8 — Reports and handoff
Create nine E5 reports, update progress/error ledger/TODO/Graphify, and report each gate separately.

## Error prevention

- Before code edits, read `errors/ERRORS.md`; validate fixture checksum sentinels against the migration's lowercase-hex constraints.
- Do not infer that a loopback database with expected names is synthetic; require an explicit target marker and matching database/role identity.
- Never use user or cloud credentials; never run SQL until the owner has reviewed the exact target and cleanup boundary.
