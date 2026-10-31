# Track D4 — Root Cause Assessment

## Finding

**Root cause is not yet established.** The available evidence establishes a failed startup path, not the underlying defect.

Observed conditions:
- Docker Desktop 4.93.0.240920, CLI 29.8.1, Compose 5.5.1.
- Current context is \`desktop-linux\`, endpoint \`npipe:////./pipe/dockerDesktopLinuxEngine\`.
- \`docker version\` reports client 29.8.1, but cannot connect to the Engine because \`dockerDesktopLinuxEngine\` does not exist.
- \`com.docker.service\` is \`Stopped\`, \`Manual/DEMAND_START\`, LocalSystem; Win32 exit code 1077 (service has not been started since boot). Config depends on LanmanServer.
- \`wsl --status\` succeeds in this diagnostic session; default is Ubuntu, WSL2. \`wsl --list --verbose\` reports Ubuntu and docker-desktop both Stopped, version 2. WSL 3.0.3.0, kernel 6.1.85.4-1.
- Host reports \`HypervisorPresent=True\` and processor virtualization firmware enabled. Optional-feature state queries were unavailable; no conclusion about each feature's enabled state is warranted.
- Event Viewer query for System and Application errors/warnings around the D3 startup window (2026-10-29 23:40–2026-10-30 00:10 UTC), filtered for Docker/WSL/Hyper-V/HNS/compute providers and message text, returned no matching records.
- Docker Desktop host log confirms the backend API pipe was missing at 2026-10-30 00:57:06 UTC. The backend and monitor logs were stale from 2026-10-20, so they do not explain the D3 attempt.

The stopped service is a material symptom and may be relevant, but the evidence does not prove it is the root cause. No service-start attempt or repair was performed. Docker's zero/blank formatted \`docker info\` fields are not evidence that its store is empty.

## Safe next diagnostic

An administrator should inspect current Docker Desktop diagnostics and Windows feature/service event details, then start the Docker Desktop Service only if the owner/admin confirms it is appropriate. Exact suggested command, not executed:

\`\`\`powershell
Start-Service -Name com.docker.service
\`\`\`

After any authorized startup, wait for readiness and run \`docker info\`; inventory with \`docker ps -a\`, \`docker inspect\`, \`docker volume ls\`, \`docker network ls\`, and \`docker port\` before creating NAVI resources.
