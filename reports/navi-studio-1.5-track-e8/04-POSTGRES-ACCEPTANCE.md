# E8 PostgreSQL Acceptance

## Guarded identity

- Docker context: `desktop-linux`.
- E5 container: `navi-e5-postgres17`, ID `0fbf5ea4079e9bf1ebeb29487601c7bce027e636d3cce0802bc7eee89a47ef22`, running with restart policy `no`.
- Image: `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- Volume: `navi-e5-postgres17-data`, mounted at `/var/lib/postgresql/data`.
- Network: `navi-e5-postgres17-net`, dedicated bridge; published port is only `127.0.0.1:55433 -> 5432/tcp`.
- Database: `navi_e4_test`; login role: `navi_e4_runner`; marker: `navi-e4-synthetic-v1`; PostgreSQL: 17.11.

PostgreSQL reports its private Docker bridge address as `inet_server_addr()`, while the host-side connection was configured to `127.0.0.1:55433`; the test therefore verifies the configured host endpoint and a private container-side server address rather than incorrectly expecting PostgreSQL's own server address to be loopback.

## Synthetic proof

Latest run ID and campus: `52b0f527cf0d4ddd86a6486bda762293` / `navi-e8-synthetic-52b0f527cf0d4ddd86a6486bda762293`. Earlier successful proofs are retained under the other `integration-*` log directories.

- Atomic batch committed at revision 1 with 3 acknowledgments for building, routing, and terrain.
- Byte-identical retry returned `replayed`.
- Reusing a mutation ID with changed payload returned `MUTATION_ID_REUSED`.
- Stale writer returned `STALE_REVISION` and did not advance revision.
- A separate reader process reconstructed revision 1 with 3 scopes, 3 receipts, 1 change set, 3 operations, and 2 checkpoints.
- Scope checksums: building `1bab2f25ca9d6d01bf49a8bb6b404e9c3ccea2e6054aa905326900397cabdf29`; routing `cfd2ba936622b48737491f235e5777de7d341bbe7a11ac6323e801f82887cb37`; terrain `4daa5fbb5bd4e301681a40600ed6daa37e8383a0958251dab63ff4d47e7d85e3`. Reconstructed campus checksum: `14a6fc1e1b1eb42653ee82eaaf8d88221f0fec85bf0e393af23f611675a4dd6f`.
- Writer, reader, and sanitized runner logs are in `logs/integration-52b0f527cf0d4ddd86a6486bda762293/`.

Three earlier runner attempts are retained: image metadata preflight stopped before secret use, a missing local `tsx` runner stopped before DB work, and a loopback-server-address assertion stopped before migration. No credentials are in the logs. The successful run uses the installed local Vitest runner and makes no package installation.

The live acceptance does not inject an actual mid-transaction failure to prove rollback atomicity; rollback behavior is covered by adapter unit tests. Route auth/cross-campus database isolation and E8 export/restore remain unverified by this live proof. The D2 container remains exited with its original data volume and network. D2/E5 containers, volumes, and networks were confirmed intact after acceptance.
