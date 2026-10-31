# NAVI Studio 1.5 — Track E6 Summary

**Date:** 2026-10-30  
**Worktree:** `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027`  
**Branch / HEAD:** `codex/navi-studio-1.5-track-a-20261027` / `bead5101fc853959f99f7aabcdba72423f48f839`

## Status

- **PASS:** E5 synthetic PostgreSQL 17.11 database remains clean; historical dump/restore evidence is preserved.
- **PASS:** Independent AES-256-GCM synthetic envelope was recovered in a separate Node process; wrong-key and tamper attempts were rejected; temporary secret/artifact were removed.
- **PASS:** 199 focused tests passed across scoped persistence, save state, legacy graph API, publishing, and navigation.
- **PASS:** Focused ESLint completed with exit code 0.
- **BLOCKED:** The dashboard labels the selected `main` branch `PRODUCTION` although its project title is `navi-development`; this differs from the Production ref in source. The target environment therefore needs owner disambiguation before any Development export.
- **BLOCKED:** The Supabase dashboard reports the Free plan, which has no scheduled project backups. No usable existing backup is available from that feature.
- **OWNER APPROVAL REQUIRED:** A real Development logical export and isolated restore remain unapproved and must wait for the target identity conflict to be resolved.
- **NOT PROVEN:** Key recovery outside the current Windows user/profile or by a second custodian; end-to-end real Development restore; Supabase managed-service recovery.

No Supabase data was queried or exported. No project, schema, policy, or setting was modified. No production traffic was switched. E5 and D2 Docker resources remain intact. No source code was changed for E6; existing staged source work was reviewed and verified, and the E6 test harness/report artifacts were added.

See the seven detailed reports and timestamped focused logs in this directory. The earlier E5.2 report and logs remain unchanged.

