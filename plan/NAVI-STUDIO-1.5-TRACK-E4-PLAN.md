# Track E4 Implementation Plan

**Goal:** Complete the local code-only authorization/replay/transaction gate and prepare a PostgreSQL 17 integration harness that stays disabled until explicitly configured.

**Spec:** `spec/NAVI-STUDIO-1.5-TRACK-E4-SPEC.md`

## Constraints

- Preserve the D6 archive, branch and all preexisting dirty/untracked work.
- No database connections, SQL execution, Docker/WSL startup, PostgreSQL installation, Supabase/cloud operations, real data, active route wiring, commits, or pushes.
- Use TDD for adapter behavior changes. Keep SQL as proposed source and tests as simulated unless the integration harness is explicitly enabled in a later authorized task.

## Tasks

### T1 — Baseline and contract review (complete)
Verify D6 backup hash, branch/HEAD and dirty state; query Graphify; read relevant error-prevention entries; inspect E3 interfaces/schema/fakes.

### T2 — Authorization and identity boundaries (complete)
Add trusted server-principal resolution and distinct read/write authorization; protect every read/write method; bind campus/document identity and use repeatable-read transactions for consistent reads. Add failing tests first.

### T3 — Canonical batch identity and receipt binding (complete)
Define a deterministic batch checksum that preserves E1/E2 caller contracts. Persist the checksum on change-set and receipt rows with a composite FK. Verify exact replay and reject changed, partial, substituted, or cross-batch receipts. Update schema and rollback proposals.

### T4 — Transaction and reconstruction edge cases (complete)
Test lock timeout/deadlock/serialization mappings, ambiguous COMMIT acknowledgment, rollback, mixed changed/no-op candidates, duplicate scopes, invalid stored values, safe revision overflow, read isolation, and reconstruction integrity.

### T5 — Disabled PostgreSQL 17 integration harness (complete)
Add PowerShell/SQL harness scripts with explicit opt-in, strict loopback/database/user/version/schema checks, synthetic seed, migration/rollback, concurrent writer, logical dump/restore and reconstruction verification. Refuse by default and never self-provision or clean external resources.

### T6 — Regressions and static checks (complete)
Run adapter, scoped-save, history, E2 compatibility, focused ESLint and TypeScript baseline comparison. Browser smoke only if safely practical. Verify route isolation and existing save paths.

### T7 — Reports and logs (complete)
Create required eight E4 reports; update progress/error ledgers, TODO and Graphify after code edits. Document harness default-off and actual PostgreSQL status accurately.

## Risk prevention

- Before editing adapter code, read the E3 error ledger entries: retry receipts before stale checks; seed identity mismatch fixtures; model READ COMMITTED visibility after lock wait; use valid checksums; preserve worktree state.
- For harness failure or mismatch, stop before SQL execution; the harness must finish all preflight identity checks before connecting for migration actions.
- SQL and destructive rollback tests are permitted only in a later, explicitly enabled isolated harness invocation; E4 itself does not execute them.
