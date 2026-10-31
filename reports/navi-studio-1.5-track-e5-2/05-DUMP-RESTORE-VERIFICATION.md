# Synthetic Dump and Restore Verification

**Status: PASS on `navi_e4_test`.**

The E5 runner created a custom-format `pg_dump` of the synthetic `navi_scoped` schema using PostgreSQL 17 client tools in the E5 container. It copied the dump to the Windows host, validated it with `pg_restore --list`, copied the same bytes back to the container, rolled back the harness-owned schema, restored the archive, and compared logical fingerprints.

SHA-256 at all three checkpoints matched:

`5471a9203fb8a49c85fa8ac4c786b020baf40d9059ed2c930af4c3964458a584`

The pre-restore and post-restore logical fingerprints both equal:

`75c5b391cab017b9c48acc8c11259a0e`

The dedicated adapter test independently verified row counts before the dump: 2 scope heads, 1 change set, 2 operations, 2 mutation receipts, and 2 checkpoints for the test campus. Final post-run inspection confirms the harness rolled back the `navi_scoped` schema, leaving zero application tables in the test database. The database, role, container, volume, and network remain available; no volume was deleted or reinitialized.

Evidence is in `logs/e4-integration/integration-00980486cdcf40cc9d3305bc309ee41f/pg-restore-list.log`, both logical fingerprint logs, `synthetic-dump.sha256.log`, and `RESULT.txt`.

