# Track E1 — Remaining Persistence Gates

Track E1 only establishes a Development editor integration with local draft recovery plus an ephemeral scoped-history reference. It does **not** establish that any real Development database backup can be restored.

Before a real Development backup/restore rehearsal, the project still needs:

1. An explicitly authorized, isolated Development source and restore target with verified campus/database identity and owner-approved access method.
2. A supported PostgreSQL/PostGIS local recovery environment and compatible source/target versions; Track D6 recorded Docker startup failure and no native PG/PostGIS installation, so no such database proof exists yet.
3. A reviewed backup/export and restore runbook with retention, encryption-key ownership, integrity verification, rollback and cleanup boundaries.
4. A real Development backup/restore rehearsal performed only after its scope and credentials are explicitly approved; verify schema/extension versions, scoped data counts/checksums, sequence/foreign-key integrity, RLS/privileges and application read behavior.
5. A durable scoped-history storage design and cloud contract before any future persistence migration. The current reference history is intentionally in-memory and Development-only.
6. An explicit production architecture, authorization and migration review before any production persistence changes. No such changes were made in E1.

The existing `/api/graph` save queue and manual cloud save remain the application cloud persistence path. E1 scoped operations must not be counted as cloud writes or database recovery evidence.
