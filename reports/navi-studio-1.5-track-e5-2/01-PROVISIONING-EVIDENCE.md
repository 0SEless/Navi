# E5.2 Provisioning Evidence

## Protected preflight and final inventory

- Worktree: `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027`
- Branch: `codex/navi-studio-1.5-track-a-20261027`; HEAD: `bead5101fc853959f99f7aabcdba72423f48f839`.
- D6 verified archive: `C:\Users\Administrator\Documents\Codex\NAVI-Track-D6-Backups\NAVI-Studio-1.5-Track-D6-20261030-100950-verified.zip`; SHA-256 `dc9327641f30c0b498f327d84075cccba7679f2ab2b7926f98ef77b5d33e0c8e` rechecked after E5.
- Docker context `desktop-linux`, Engine `29.8.1`.
- The pre-existing D2 container remains ID `33f738e498240f4cd470c7fc6a391370db11d79ccaaf5af8fabb3d1f6c29ff4c`, exited 255, restart `no`; D2 volume `navi-d2-synthetic-postgis17-data` and network `navi-d2-synthetic-isolated` remain unchanged. The seven anonymous volumes remain untouched.

## E5 resources

- Image: `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`; image metadata records PostgreSQL 17.11; no image pull was needed.
- Container: `navi-e5-postgres17`, ID `0fbf5ea4079e9bf1ebeb29487601c7bce027e636d3cce0802bc7eee89a47ef22`, running, restart `no`.
- Volume: `navi-e5-postgres17-data`, mounted at `/var/lib/postgresql/data`, retained through network and container correction.
- Network: `navi-e5-postgres17-net`, ID `a739ed866e5585d4b65d779ac8101c581ec1b3935e229a72e7025d8761618590`, bridge, `internal=false`, `com.docker.network.bridge.enable_ip_masquerade=false`.
- Port binding: only `127.0.0.1:55433 -> 5432/tcp`; Windows TCP check passed. The no-masquerade bridge setting is not claimed to be a general egress firewall.
- Secret files stay outside the repository under `C:\Users\Administrator\Documents\Codex\NAVI-E5-Secrets`; credential values are not recorded. The bootstrap secret is mounted read-only. The runner secret is read only by the host-side test process.
- Synthetic database: `navi_e4_test`; restricted LOGIN role: `navi_e4_runner`; database comment: `navi-e4-synthetic-v1`. The runner is not superuser, cannot create roles or databases, and does not bypass RLS. Final query confirmed `navi_scoped` absent and zero application tables after rollback.

## Resource budget and final disk state

Final C: free space: `11,833,536,512` bytes (about 11.02 GiB). `docker system df`: images 1.378 GB (3 total / 2 active), containers 131.1 kB (2 total / 1 active), volumes 206 MB (9 total / 2 active), build cache 0. No prune or cleanup was run. The E5 image size was reported earlier as 423,189,986 bytes; no additional image pull occurred.

See `logs/final-inventory.log`, `logs/final-database-state.json`, `logs/provisioning.log`, `logs/network-replacement.log`, and `logs/e4-integration/` for evidence.

