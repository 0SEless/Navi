# Real database readiness gate

## Not yet proven

- The forward migration has not been applied or validated by PostgreSQL.
- The adapter has not run against PostgreSQL; simulated transactions do not prove ACID, SQL compatibility, RLS enforcement, role grants, advisory-lock behavior, or crash recovery.
- No real Development export, encrypted backup, restore, integrity check, or owner-approved recovery rehearsal occurred under E3.
- No claim is made that the real Development database is recoverable.

## Required before a real Development backup/recovery claim

1. Review the migration with the Development owner, confirm the database/version/roles and private-schema exposure policy, and validate it on a disposable PostgreSQL-compatible environment first.
2. Run adapter integration tests against the target PostgreSQL version with real concurrent sessions, failure/rollback injection, RLS/role checks, and dump/restore checksum verification.
3. Obtain explicit authorization for the Development backup/export and a separately reviewed restore target. Keep Production out of scope.
4. Verify backup encryption, key custody, integrity, restore completeness, and operational logs; record actual PostgreSQL/PostGIS versions and row/scope counts.
5. Review and approve any rollback only after preserving and verifying newly written scoped data.

E3 satisfies the disconnected implementation and simulated design-check gate only. Real database and Development recovery gates remain **OPEN**.
