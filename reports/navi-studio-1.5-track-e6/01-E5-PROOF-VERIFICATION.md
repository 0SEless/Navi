# E5.2 Synthetic Proof Verification

## Prior proof preserved

The E5.2 report records a successful migration/contract run, concurrent commit test, real TypeScript adapter integration against PostgreSQL, custom-format dump/restore, logical fingerprint comparison, and cleanup of only the harness-owned `navi_scoped` schema.

- PostgreSQL: **17.11**.
- Synthetic DB: `navi_e4_test`; marker `navi-e4-synthetic-v1`; runner `navi_e4_runner`.
- Dump SHA-256: `5471a9203fb8a49c85fa8ac4c786b020baf40d9059ed2c930af4c3964458a584`.
- Pre/post restore logical fingerprint: `75c5b391cab017b9c48acc8c11259a0e`.
- Real adapter test: **1 passed**.
- E5.2 result file: `reports/navi-studio-1.5-track-e5-2/logs/e4-integration/integration-00980486cdcf40cc9d3305bc309ee41f/RESULT.txt`.

## E6 read-only live check

Read-only Docker identity and database query on 2026-10-30 confirmed:

- Context `desktop-linux`, daemon ID `137c7f6b-b76c-4205-90ff-b1170afc87b8`, Engine 29.8.1.
- E5 container `navi-e5-postgres17`, ID `0fbf5ea4079e9bf1ebeb29487601c7bce027e636d3cce0802bc7eee89a47ef22`, running on the preserved E5 network and named volume.
- D2 container `navi-d2-synthetic-postgis17`, ID `33f738e49824`, remains Exited (255); no action was taken on D2.
- E5 query returned database `navi_e4_test`, role `navi_e5_admin`, server 17.11, `navi_scoped` absent, and zero non-system tables.
- No fixture content was read. The E5.2 fixtures are synthetic test objects only, not campus data.

E5.2 evidence does not demonstrate recovery of the real Development database. Existing E5 container, network, volume, and D2 resources were preserved.

