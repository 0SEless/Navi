# Track D6 — Docker Failure Evidence

## Preserved evidence

The D5.1 diagnostics were reused; no repeat startup attempt was made. Docker Desktop was 4.93.0.240920 on Windows 11 Pro build 26200. The recorded backend error is Windows error 1920 while renaming `engine.sock` to `engine.sock.stale`: “The file cannot be accessed by the system.” The owner screenshot showed the reverse rename direction, so both observations remain documented without inferring a root cause.

The socket is a zero-byte `Archive, ReparsePoint` at `C:\Users\Administrator\AppData\Local\docker-secrets-engine\engine.sock`. ACL/reparse inspection itself returned error 1920. Parent directory ACL grants SYSTEM, Administrators, and the Administrator account Full Control. `com.docker.service` was Stopped/Manual; Ubuntu and `docker-desktop` WSL distributions were stopped; no Docker/backend/vpnkit process was present at final check. C: was reported healthy by NTFS event 98; no matching Defender block event was found. Root cause is unresolved.

The authorized normal startup attempt remained pending for about 80 seconds and was interrupted; it did not advance the backend error log or leave Docker running. A separate service start failed because this execution token was Medium Mandatory Level. No further Docker retry was performed.

## Package and handling

- Local package: `C:\Users\Administrator\Documents\Codex\NAVI-Track-D6-Backups\NAVI-Track-D6-Docker-Diagnostics-20261030.zip`
- SHA-256: `e5b7a4c2e51fcdc15f4fd99f40900035ac2b40dcbf0bc2fcf3277d5a84f7870b`
- Package contains a short diagnostic summary and its checksum only. Secret-pattern review passed. It has not been uploaded or shared.

Do not delete, rename, replace, or change permissions on the socket. Do not factory-reset Docker, reset WSL, reinstall, or prune/clean unrelated resources. If a Windows/Docker administrator recommends a repair, review the exact action and target before applying it.
