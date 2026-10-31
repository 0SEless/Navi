# Track D4 — Engine and Workload Verification

## Engine

\`\`\`
docker context ls --format '{{.Name}}|{{.DockerEndpoint}}|{{.Current}}'
default|npipe:////./pipe/docker_engine|false
desktop-linux|npipe:////./pipe/dockerDesktopLinuxEngine|true

docker version --format '{{.Client.Version}}|{{.Server.Version}}'
29.8.1|
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine;
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
\`\`\`

Docker Desktop status had previously returned “Could not retrieve status.” Follow-up host log at 00:57:06 UTC reports \`open \\\\.\\pipe\\dockerBackendApiServer: The system cannot find the file specified.\`

## Workloads and conflicts

\`docker ps -a\`, inspect, volume, network, and port inventory were **not run** because the Engine did not become ready. No assumptions about existing containers, restart policies, mounts, or networks are made. TCP ports 5432, 55432, 2375, and 2376 had no listeners during this check. This does not rule out Docker network/volume conflicts.

The D3 attempt created no NAVI container/image/volume/network. The D4 checks likewise created none. No unrelated workload was modified.
