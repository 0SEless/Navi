# NAVI canonical repository recovery — 2026-10-03

Recover one complete NAVI root Next.js application from the divergent GitHub branches without destroying any work.

Success criteria:
1. Every relevant branch and unique commit has a recorded evidence-based disposition.
2. The new release/navi-canonical-2026-10-03 branch preserves Studio/floor persistence, routing, building edits, and R2/panorama invariants.
3. Lockfile install, production build, relevant regression tests, and read-only production smoke checks pass, with baseline failures explicitly classified.
4. The tested SHA is pushed, remotely verified, and made default only after all gates pass.
5. All original remote branches and worktrees remain; the dirty primary tree is unchanged.

Known pitfalls: unstaged authored store dependencies; shell quoting failures; stale recovery results; conflating unique SHAs with absent functionality; Next builds skipping TypeScript checks; GitHub CLI credentials can differ from Git transport.
