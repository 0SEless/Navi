# Windows Toolchain and Storage

## Read-only inspection

| Check | Result |
|---|---|
| OS / architecture | Windows 11 Pro, 10.0.26200, x64 |
| C: | NTFS, 237.5 GB total, 12.8 GB free |
| Docker Desktop | 4.93.0.240920 at `C:\Program Files\Docker\Docker\Docker Desktop.exe` |
| Docker CLI | 29.8.1, Windows x64; context `desktop-linux`; engine unavailable |
| Docker Desktop CLI plugin | 0.4.4 |
| Compose | 5.5.1 |
| Docker service | `com.docker.service`, Stopped, Manual |
| WSL | Default version 2; `Ubuntu` and `docker-desktop` version 2 both Stopped (elevated read-only WSL query succeeded) |
| PostgreSQL service/client | No PostgreSQL service or installation at `C:\Program Files\PostgreSQL`; `psql`, `pg_dump`, `pg_restore`, `initdb`, `postgres` not on PATH |
| Encryption tools | `cipher.exe` exists; `age`, `gpg`, `7z`, `openssl` absent from PATH; PowerShell CMS cmdlets available but no CurrentUser certificates found |
| Ports | No listener found on TCP 5432 or 55432 |

Commands included `Get-CimInstance Win32_OperatingSystem`, `Get-Volume`, `Get-Command`, `Get-Service`, `docker info`, `docker desktop version`, `docker compose version`, `wsl --status`, and `wsl --list --verbose`. `wsl` required an elevated read-only execution; initial sandbox invocation returned `Wsl/E_ACCESSDENIED`.

## Safe path

Docker Desktop is the least disruptive installed runtime; no native PostgreSQL installation or software install was started. Its offline container inventory cannot be queried with the daemon stopped. The Desktop setting store has `AutoStart=false` and `WslEngineEnabled=true`; that does not establish container restart-policy state. The proposed container uses a unique NAVI D2 name and volume, PostgreSQL 17, loopback-only port 55432, and `restart: "no"`. Startup remains pending owner/admin safety confirmation.

Disk space is adequate for a small synthetic workload in principle, but the image was not pulled, so actual image size is not measured. Reserve several GB for the WSL VHDX and image layers. The `Temp` drive is a small system-managed volume and is not a backup destination.
