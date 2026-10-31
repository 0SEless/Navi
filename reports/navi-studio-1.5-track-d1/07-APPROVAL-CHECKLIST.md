# Approval Checklist and Artifact Integrity

Track D1 authorizes investigation and local proposals only. No execution approval is inferred from these checkboxes.

## A — Identity and isolation

- [ ] Owner confirms Dev Vercel Preview/Development endpoint and project-ref match `scvgulusmutnzasmgysx` using a secure channel; do not disclose key values in the report.
- [ ] Reconcile source-required `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` with deployed variable names/scopes; prove service key is server-only.
- [ ] Verify branch-to-Preview linkage, Auth Site URL/redirect allowlist, and storage provider isolation. No Production credential.

## B — Backup

- [ ] Choose encrypted destination, key custody, retention, and operator; install compatible CLI/pg tools and encryption utility.
- [ ] Approve Dev export, verify three dump artifacts and hashes, and document excluded Auth/Storage/provider configuration.

## C — Restore and rehearsal

- [ ] Choose isolated local PG+PostGIS or a separately approved cloud project; owner confirms cost before resource creation.
- [ ] Approve restore, validate schema/counts/FKs/RLS/PostGIS/Auth mapping, and preserve the original Dev data.

## D — Security repair

- [ ] Security/database owner reviews forward and inverse SQL and current exact policy/ACL definitions.
- [ ] Approve negative API tests and PostGIS compatibility checks on disposable restored Dev.
- [ ] Separately approve any shared Dev application; review advisor delta and rollback path.

## E — Scoped schema

- [ ] Confirm identifiers, actor/FK model, checkpoint format, retention, and exposed-schema policy.
- [ ] Review implementation transaction/CAS/idempotency and load test on isolated restore.
- [ ] Approve additive migration, deployment window, monitoring, and non-destructive rollback.

## SQL proposal SHA-256

Hashes are computed over exact local bytes. Any edit invalidates the corresponding approval and hash.

| Artifact | SHA-256 |
|---|---|
| `sql/01-security-repair-proposal.sql` | `ccac1a1ce3d6d9757bafed07069fb7dd5756929d42face3e695f9270a7594c3a` |
| `sql/02-security-rollback-proposal.sql` | `e2ce8d09a94afe8dbb5d9ee1b1da2ba79d4b78235b03159d477ecb389a2fc898` |
| `sql/03-security-postflight-readonly.sql` | `628f8a1d513c6ae9edf89ea576a2589d1c11001f3f1c0c6a6dfb9e50d5abe9fe` |
| `sql/04-scoped-persistence-additive-proposal.sql` | `6e2b01a7c49617d9bed2a800bb047386a4eeaad194830771050494075e8bdb71` |
| `sql/05-scoped-persistence-rollback-proposal.sql` | `0b05c97b906f9f19ec5204a4fd31fc5d4b00e8e9207cf1858ec3c77b6663776a` |

Do not run SQL or create resources as part of approving this report. Execution must be a separately scoped task with approved target, operator, backup evidence, exact artifact hashes, maintenance window, and rollback criteria.
