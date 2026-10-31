# GitHub Source Provenance

## Local checkout

- Branch: `codex/navi-studio-1.5-track-a-20261027`.
- HEAD/base: `bead5101fc853959f99f7aabcdba72423f48f839`, commit message `fix(studio): make server adoption atomic and invalidate stale editor state`.
- Remote configured for this checkout: `origin https://github.com/0SEless/Navi.git`.
- The Track A branch has no configured upstream. D3 branch-name search found no matching `codex/navi-studio-1.5-track-a-20261027` branch in either remote repo.
- The checkout has 20 modified tracked paths and the existing untracked Track B/C1/C2/D1/D2 files. New Track D3 reports and the small D2 synthetic encryption/Compose edits are local working-tree state; no D3/D2 implementation commit was created or pushed.

## Remote metadata

| Repo | Default branch and tip | Base SHA | Track A remote branch |
|---|---|---|---|
| `0SEless/Navi` | `release/navi-canonical-2026-10-03` → `1d65afe06b69fe4d590c3d711507e775aa674838` | Present; same SHA as local HEAD | Not found |
| `0SEless/Navi-next` | `main` → `cf74dff479e04c8832a15cd7295ed1693c0da401` | GitHub returned 422: no commit found for the base SHA | Not found |

GitHub compare reports `0SEless/Navi` default branch is 6 commits ahead of the local base and 0 behind. `0SEless/Navi-next` does not contain the base commit according to the read-only fetch. GitHub repo metadata lists `Navi` and `Navi-next` as public and unarchived.

## Publication conclusion

The base commit exists in `0SEless/Navi`; this does not publish the uncommitted Track B–D2 changes. No exact Track D2 implementation commit exists in the local checkout, so there is no commit to match remotely. Vercel’s current Git context links only `navi-next` to `0SEless/Navi`; D1 previously saw a CLI-sourced Dev candidate deployment, but the current Vercel API cannot revalidate it. No deployment provenance for this local working tree is established. No remote write or push occurred.
