# Track D5 — Approval Package for a Future Development Backup

No authorization for a real export is inferred from Track D5 or prior synthetic testing. Approval should cover one bounded operation with these fields completed:

| Approval field | Required value |
|---|---|
| Supabase target | `navi-development`, ref `scvgulusmutnzasmgysx` (verify identity immediately before run) |
| Export operator | Named owner-approved person/process and least-privilege identity |
| Export method | Exact CLI/API and version; exact schema/data/role options and managed-schema exclusions |
| Credentials | Approved source, scope, expiry, and revocation plan; no credentials committed or logged |
| Destination | Exact encrypted backup path/store, region, access list, and retention |
| Encryption | Algorithm/format, key ID, independent custodian, custody channel, and successful recovery test |
| Restore target | New isolated disposable target, exact project/host, ownership, and cleanup owner |
| Scope | Database objects/data plus explicit Auth, Storage metadata and object-byte, settings, edge-function, and external-media inclusion/exclusion |
| Cost | Current plan/usage, expected egress/storage/compute, and spending limit |
| Verification | Source manifest, decrypt/hash, restore procedure, constraints/counts/checksums, PostGIS checks, RLS/grants, and application smoke checks |
| Failure/rollback | Stop conditions, plaintext removal, target isolation, cleanup owner, and incident path |
| Retention | Backup expiration, evidence retention, deletion/rotation procedure, and custodian confirmation |

Execution must wait until Docker/local restore is available and the owner explicitly approves a completed package. D5 did not submit or execute an export.
