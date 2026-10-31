# Approval and Execution Plan

No approval-gated action was taken in Track C2. This document identifies the next explicit decisions and the exact scope to present for approval.

## Required before first Dev cloud write

1. **Environment isolation sign-off.** Confirm `navi-dev-studio` is the intended Dev Vercel project; verify its Preview branch/domain and actual Supabase ref equals `scvgulusmutnzasmgysx`; reconcile `SUPABASE_SECRET_KEY` versus source’s `SUPABASE_SERVICE_ROLE_KEY`; confirm no Production ref/key is present in the Dev project. Read only key names/targets in the report; have the owner check actual values in Vercel’s protected UI.
2. **Development backup authorization.** Approve a controlled logical export of only `navi-development` into encrypted, access-controlled storage. No Production data, auth secrets, passwords, or object bytes in the first database-only export. Identify operator, destination, retention, encryption, checksum process, and cleanup time. Provider plan is Free and does not have documented downloadable managed daily backups. No export is a no-cost operation guarantee; obtain a target host/storage estimate first.
3. **Security migration approval.** Approve the exact SQL in report 03 for Development only: revoke anon/authenticated mutation on `published_maps`, preserve reads and service-role publish, revoke anon/authenticated DML on PostGIS `spatial_ref_sys` while preserving SELECT. Run only after backup/recovery readiness and PostGIS compatibility tests. Estimated migration cost is no paid resource creation; potential runtime impact is direct write rejection and PostGIS compatibility regression. Rollback SQL is in report 03 and restores the broader original privileges, which is a security regression.

## Required before scoped cloud persistence

4. **Contract/schema review.** Approve the additive campus commit tables/API, campus-wide CAS, idempotency retention, error semantics, dependency validation, exact acknowledgment, and server-only writer. No independently writable scope until cross-scope transaction tests pass.
5. **Revision/retention policy.** Approve checkpoint cadence and historical retention after testing representative synthetic campus sizes. No automatic revision deletion is proposed. Keep legacy snapshots and existing published artifact format until read compatibility and recovery are verified.
6. **Terrain/storage scope.** If terrain ingestion is desired later, approve a distinct Dev bucket/account, metadata contract, upload limits, object retention, provenance requirements, and an explicit object restore exercise. This plan currently creates no bucket or uploads any file.

## Execution sequence after approvals

1. Confirm project refs, domain/branch, Dev-only environment variables, service credential compatibility, and auth callback URLs.
2. Establish and checksum an approved Development backup; separately capture non-sensitive provider settings inventory.
3. Apply the approved security change to Development only, then run negative authorization, public-read, server-publish, and PostGIS tests.
4. Implement the database transaction and route in an isolated development branch with mock contract tests plus transaction tests against a disposable isolated Dev target.
5. Verify duplicate retries, interruption recovery, stale revision, concurrent dependency change, and admin authorization. Keep manual save disabled until all pass.
6. Only after owner review, configure the Development project and deploy to its Preview target. Deployment is a separate approval; no Production promotion is included.

Each future request should specify source/target project refs, exact Vercel project/environment, migration or export artifact, backup/checksum location, estimated cost, verification steps, and rollback. Stop if any value resolves to Production or if the authoritative ref is ambiguous.
