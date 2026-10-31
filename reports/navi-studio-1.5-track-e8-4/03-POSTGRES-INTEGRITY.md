# E5 PostgreSQL integrity evidence

Final verification log: `logs/run-fec85186572d4c47ae905ff8e03a0222/verify-postgres.log`; bootstrap log: `logs/run-fec85186572d4c47ae905ff8e03a0222/bootstrap-postgres.log`.

The browser test wrote only to the existing isolated local E5 PostgreSQL 17 environment. An independent PostgreSQL verifier checked the campus after the browser closed and verified stored operation/receipt/checkpoint rows, scope heads, reconstruction, and checksums.

- Synthetic campus: `navi-e8-browser-fec85186572d4c47`
- Campus revision: 1
- Scope count: 4
- Change sets: 1; operations: 1; receipts: 1; checkpoints: 1
- Operation scope: `terrain` for the campus; no building, routing, or campus-settings operation
- Unchanged scope heads: building 0, routing 0, campus-settings 0
- Stored JSONB payload: 936 bytes
- Reconstructed checksum: `631d2da6fc30b2145a8d2e547d1062ab619db0d851aaaf00ffc7a68f92ac6fc3`
- Revision checksum: `631d2da6fc30b2145a8d2e547d1062ab619db0d851aaaf00ffc7a68f92ac6fc3`
- Terrain scope checksum: `e4945fb40d86291da1d23839996e1babeba9326b61808512a1e73bb272600014`

The stored area has stable ID `terrain-5f278583-96c5-4fbd-8008-6c54de039e80`, name `Synthetic north lawn`, four ordered vertices, and elevation `3.25`. The reconstructed datum is the campus-local synthetic datum with zero reference `Synthetic benchmark point at 0.000 m` and `authored-not-surveyed` status.

Verifier result: 2 passed, 1 mode-specific test skipped. An initial verifier assertion compared PostgreSQL `BIGINT` values as numbers while node-postgres returned strings; the verifier was corrected to normalize the value, then the independent verification passed. No D2 resource or unrelated Docker resource was changed.
