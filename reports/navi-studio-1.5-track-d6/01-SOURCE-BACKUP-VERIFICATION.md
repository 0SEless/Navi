# Track D6 — Source Backup Verification

## Backup artifact

- Path: `C:\Users\Administrator\Documents\Codex\NAVI-Track-D6-Backups\NAVI-Studio-1.5-Track-D6-20261030-100950-verified.zip`
- SHA-256: `dc9327641f30c0b498f327d84075cccba7679f2ab2b7926f98ef77b5d33e0c8e`
- Sidecar checksum: `C:\Users\Administrator\Documents\Codex\NAVI-Track-D6-Backups\NAVI-Studio-1.5-Track-D6-20261030-100950-verified.zip.sha256`
- Provenance: branch `codex/navi-studio-1.5-track-a-20261027`, HEAD `bead5101fc853959f99f7aabcdba72423f48f839`, common Git directory recorded in the archive.

## Inventory and verification

The archive was prepared before D6 implementation edits. It contains 157 exact snapshots of changed tracked/untracked source and report files, a binary diff from HEAD, source inventory, restore instructions, and Git provenance. The ZIP has 162 entries. After extraction to a temporary rehearsal directory, 161 listed file SHA-256 values matched. The archive opened and the non-destructive extraction rehearsal completed. The original worktree was not overwritten.

Tracked changes and selected untracked files were inventoried. No nested `.git` repositories were found. Six package symlinks/reparse links under `node_modules/@navi/*` were excluded with dependencies. A secret-pattern scan over selected archive contents and tracked diffs returned no matches.

Excluded content included `.env`/credential material, database dumps, dependencies, caches, generated/build output, and browser/test artifacts. The archive deliberately predates D6 code and report changes; retain it as the rollback point for the pre-D6 implementation state.

## Safe restoration procedure

1. Extract the archive to a separate temporary directory. Do not overlay the original worktree.
2. Verify `SHA256SUMS` before inspecting or copying files.
3. Review the included branch, HEAD, common Git directory, inventory and binary patch.
4. For recovery, create a separate worktree at the recorded HEAD, apply the patch there, then copy only reviewed snapshot files. Keep the original worktree intact until comparison is complete.
5. Re-run the source checksum manifest after restoration.

Backup is local and is not a substitute for a protected off-device or encrypted production backup.
