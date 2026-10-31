# Track D4 — Synthetic Restore Results

**Status: NOT RUN — blocked by Docker Engine unavailability.**

No image was pulled; no container, database, volume, or network was created. No synthetic SQL export/import, row count, geometry integrity, dump checksum, or restore verification ran. The prepared D2 Compose environment uses synthetic-only PostgreSQL/PostGIS and must only run after:
1. Engine readiness is proven with \`docker info\`.
2. Existing containers, restart policies, ports, mounts, volumes, and networks are inventoried.
3. NAVI resource names and host ports are confirmed conflict-free.

D3's separate encryption test is **crypto-only**: ephemeral AES-GCM round-trip, wrong-key rejection, ciphertext tamper detection, and temporary ciphertext cleanup passed with fabricated text. It does not prove encrypted persistent exports, key custody, or database backup/restore.
