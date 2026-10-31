# Remaining E5.2 Gates

## Synthetic gate

**Passed.** A PostgreSQL 17.11 E5-only database accepted the reviewed persistence schema, real Node adapter operations, concurrent-writer check, custom dump/restore, byte-integrity checks, logical fingerprint comparison, and owned-schema rollback. The E5 database, restricted role, container, volume, and dedicated network are retained for future authorized synthetic work.

## Requirements before a real Development backup can be called recoverable

1. Separately authorize a real Development export and restore rehearsal. This E5.2 authorization did not include Supabase, real database export, remote credentials, or cloud operations.
2. Establish a Development-specific backup identity and secret lifecycle; verify scope, access, retention, encryption, and a safe isolated restore destination before any export.
3. Record source/version/schema identity, create a backup, verify its cryptographic integrity, and restore it into an isolated non-production target without altering the source.
4. Run independent row/schema/extension/constraint and application-level integrity checks against the restored Development backup, then document recovery time and any gaps.
5. Address the whole-repository quality failures or compare them against a verified pre-change baseline before treating the app suite as clean: 34 Vitest failures, 1,556 ESLint errors, and 1,128 TypeScript diagnostics were observed in this worktree.

The no-masquerade Docker bridge is not a general egress firewall. The successful proof used only synthetic local data and did not contact Supabase, Production, or any cloud service. No E5 or D2 volumes were deleted; no Docker prune, migration outside E5, deployment, push, or Production change occurred.

