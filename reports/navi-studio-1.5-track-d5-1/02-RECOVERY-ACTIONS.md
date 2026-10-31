# Track D5.1 — Recovery Actions and Commands

## Read-only checks performed

```powershell
(Get-Item 'C:\Program Files\Docker\Docker\Docker Desktop.exe').VersionInfo | Select-Object FileVersion,ProductVersion
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'Docker Desktop|com\.docker|vpnkit|wslhost' }
Get-Service -Name com.docker.service
sc.exe query com.docker.service
sc.exe qc com.docker.service
wsl.exe --list --verbose
docker info --format 'ServerVersion={{.ServerVersion}} Containers={{.Containers}}'
Get-ChildItem 'C:\Users\Administrator\AppData\Local\docker-secrets-engine' -Force
icacls 'C:\Users\Administrator\AppData\Local\docker-secrets-engine'
icacls 'C:\Users\Administrator\AppData\Local\docker-secrets-engine\engine.sock'
fsutil reparsepoint query 'C:\Users\Administrator\AppData\Local\docker-secrets-engine\engine.sock'
Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=(Get-Date).AddDays(-3)}
Get-WinEvent -FilterHashtable @{LogName='System';StartTime=(Get-Date).AddDays(-3)}
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Windows Defender/Operational';StartTime=(Get-Date).AddDays(-3)}
```

Event queries were filtered to Docker/WSL/socket/Ntfs/Defender signals; only relevant excerpts are summarized in `01-SECRETS-ENGINE-ROOT-CAUSE.md`. Docker's `backend.error.json` and host backend log were read; the error text is reproduced there with the user path redacted in the summary.

## Recovery attempt

After the new log was examined and Docker/WSL processes were confirmed stopped, one supported CLI startup was invoked:

```powershell
docker desktop start
```

It returned no output and remained pending for about 80 seconds. The invocation was interrupted with Ctrl+C. Follow-up read-only checks found `com.docker.service` Stopped, both WSL distributions Stopped, no Docker Desktop/backend process, `engine.sock` unchanged, and `backend.error.json` still timestamped 09:44:20. No further retry was performed.

A later status/`docker ps -a` CLI query did not return within the command window; no resource-changing command was issued. Engine connectivity remains unverified/unavailable.

## Actions intentionally not taken

No application reset, Docker service restart, WSL restart/unregister, socket deletion/rename, ACL change, Docker reinstall, factory reset, prune, container/volume deletion, or termination of unidentified processes.

## Authorized service-start attempt

```powershell
Start-Service -Name com.docker.service
```

Result: `Cannot open 'com.docker.service' service on computer '.'`. The same result occurred in the elevated-command execution route; follow-up state remained `com.docker.service` Stopped, StartType Manual. `whoami /groups` showed `Medium Mandatory Level` (`S-1-16-8192`), so this execution context cannot perform the service start. No further service or application restart was attempted.
