# Track D5.1 — Remaining Approval and Owner Actions

## Separate owner approval required before any repair

Track D5.1 explicitly excludes these without separate approval:

- Delete or rename either Docker Secrets Engine socket path.
- Change Docker internal socket ACLs.
- Reset or unregister WSL distributions.
- Reinstall Docker Desktop or use factory reset.
- Terminate unidentified processes or delete Docker resources.

Do not infer permission from the `.stale` suffix. The screenshot's Reset button is not approval to reset.

## Safest next owner action

1. Use Docker Desktop's supported **Gather diagnostics** workflow to create a local bundle; inspect it for credentials or other sensitive content before sharing.
2. Ask Docker support or a Windows administrator to diagnose why Windows cannot access the `engine.sock` reparse point despite the permissive parent ACL. Provide the redacted error, Docker Desktop version, timestamps, socket metadata, and whether the error recurs.
3. If support recommends a socket/ACL/WSL/reset/reinstall operation, review its exact target and impact and obtain separate explicit approval before performing it.
4. After an approved repair, run `docker info`, `docker ps -a`, `docker images`, `docker volume ls`, and `docker network ls`; confirm the D4.1 NAVI resources and seven historical anonymous volumes before any further synthetic run.

No external diagnostic upload was performed. No real Supabase export, Supabase mutation, Vercel change, GitHub push, deployment, or Production operation occurred.

## Current execution blocker

The authorized service start was attempted but Windows returned `Cannot open 'com.docker.service' service on computer '.'`; this session runs with a Medium Mandatory Level token. The owner can continue from an elevated PowerShell session, first verify no Docker/WSL workload is active, then start the Docker Desktop service and use the normal Docker Desktop launch workflow. Recheck the logs immediately; do not repeat startup if the same socket error recurs.
