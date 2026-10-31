# Track D2 Approval Gates

Track D2 authorizes local preparation, but these actions still require an owner/administrator decision because the machine cannot establish their safety from the available state.

## A — Docker Desktop startup

**Exact command:** `docker desktop start`  
It may start the Docker WSL backend and automatically resume containers with restart policies. WSL `Ubuntu` and `docker-desktop` are currently stopped; the Docker daemon cannot enumerate stored containers/volumes while down. No destructive reset, prune, or delete will be used.

- [ ] Owner confirms resuming any pre-existing Docker containers is acceptable; or
- [ ] Administrator performs a safe offline inventory and confirms none will be affected.

If neither is acceptable, use an administrator-approved isolated native/WSL PostgreSQL 17/PostGIS runtime setup. That is a significant software install and must be separately approved after port/service review.

## B — Encryption and local secret file

**Exact read-only command, in elevated PowerShell:** `manage-bde -status C:`  
Share only conversion and protection status; never share a recovery key.

- [ ] C: is fully encrypted and protection is On, and the owner confirms recovery-key escrow in a separate system; or
- [ ] Owner identifies an already encrypted local volume/vault.

Then approve running `scripts/track-d2-local-recovery/Initialize-LocalConfig.ps1 -ConfirmRecoveryKeyCustody` to create an ACL-restricted random local database password outside the repository. The script refuses an unencrypted C: and does not overwrite an existing config.

## C — Synthetic proof

- [ ] After A/B, run `scripts/track-d2-local-recovery/Invoke-SyntheticProof.ps1` to pull the official PostGIS 17 image, create its dedicated container/volume, run synthetic SQL, and test logical dump/restore/checksum. This uses fabricated data only.
- [ ] Review the proof log, checksum, and restored-row comparison before claiming D2 success.

## D — Real Dev export (separate authorization)

- [ ] Confirm exact Dev connection target against ref `scvgulusmutnzasmgysx` through a secure owner workflow.
- [ ] Confirm Vercel project identity and Dev-only scopes using the dashboard; this tool currently returns 404/403 for the candidate project.
- [ ] Approve a separate real Development logical backup task and encrypted destination/key custodian.

No action in this checklist authorizes real Dev export, Supabase writes, Vercel changes, deployment, or Production access.
