# Track D4 — Source Backup Readiness

## Current readiness

- Worktree branch: \`codex/navi-studio-1.5-track-a-20261027\`.
- HEAD: \`bead5101fc853959f99f7aabcdba72423f48f839\`.
- Git reports 46 top-level changed/untracked entries; tracked modifications and prior B–D3 untracked artifacts remain dirty.
- C: free space: 15,529,312,256 bytes (about 14.47 GiB).
- A read-only sizing pass over changed/untracked regular files, excluding cache/output directories and likely secret or backup files, counted 618 files / 47,669,980 bytes (about 45.5 MiB).

## Proposed archive contents

Preserve tracked modifications and untracked source, tests, plans/specifications, scripts, and reports, including B–D3 evidence. Exclude regenerable \`.tmp-vitest/\`, \`demo-output/\`, \`node_modules/\`, \`.next/\`, Playwright output, and test results; exclude \`.env*\`, credentials, local databases/dumps, archives, and generated bulky artifacts. Review the exact manifest before creating an archive.

## Status

No archive was created. The available disk space appears adequate for the measured candidate contents, but no destination/retention policy or restore target was confirmed. No archive hash or restore verification exists. After confirming a destination outside transient/cache folders, create the archive from a reviewed manifest, hash it (SHA-256), list its entries, extract to a separate scratch directory, compare file hashes, and remove only that temporary verification extraction. Do not alter the live worktree.
