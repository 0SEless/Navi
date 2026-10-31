# Track D5.1 — Secrets Engine Root Cause Evidence

## Exact path and backend error

Socket directory: `C:\Users\Administrator\AppData\Local\docker-secrets-engine`  
Socket path: `C:\Users\Administrator\AppData\Local\docker-secrets-engine\engine.sock`

`backend.error.json` and `com.docker.backend.exe.log` record the backend failure at 2026-10-30 01:44:18Z (09:44:18 Asia/Manila):

`initializing Secrets Engine: listening on unix://<HOME>/AppData/Local/docker-secrets-engine/engine.sock: rename <HOME>/AppData/Local/docker-secrets-engine/engine.sock <HOME>/AppData/Local/docker-secrets-engine/engine.sock.stale: The file cannot be accessed by the system.`

The owner screenshot reports the reverse rename (`engine.sock.stale` to `engine.sock`). The log and screenshot therefore show different attempted rename directions across startup evidence. The latest backend error log specifically shows `engine.sock` to `engine.sock.stale`; neither operation is permitted as a manual repair.

## File and permission observations

- `engine.sock` exists, length 0, attributes `Archive, ReparsePoint`; timestamp 2026-10-30 09:07:27.
- The parent directory ACL read successfully: SYSTEM, Builtin Administrators, and `DESKTOP-VKRMBR2\Administrator` have inherited Full Control.
- `icacls engine.sock` failed with “The file cannot be accessed by the system.” `fsutil reparsepoint query engine.sock` returned error 1920 with the same text.
- Directory listing showed `engine.sock`; no `engine.sock.stale` entry was visible.
- No Docker Desktop/backend/vpnkit process was running during inspection. A process holding an open socket handle was not identified; no dedicated handle-inspection utility was available. This does not rule out a filesystem-level or security-filter issue.

## Other diagnostic evidence

- Docker Desktop binary version: 4.93.0.240920.
- `com.docker.service`: Stopped, Manual (Demand Start), LocalSystem. Prior Application events recorded service start at 09:07:25 and stop at 09:07:33.
- WSL distributions `Ubuntu` and `docker-desktop`: both Stopped, WSL 2.
- `docker info` could not connect to `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Application/System event query found DockerService start/stop events and NTFS event 98 reporting the C: volume healthy. No event identified the socket failure.
- Defender event review found configuration-change events (5007) but no Defender detection/block/audit events (1116/1117/1121–1124) tied to the socket. No causal link to security software is established.
- Parent directory ACL does not explain why the reparse-point file itself is inaccessible. Root cause remains unresolved; do not label this as a confirmed stale-file or lock-file condition.
