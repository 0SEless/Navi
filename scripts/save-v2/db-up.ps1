# Start the disposable Save v2 test database (idempotent).
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/save-v2/db-up.ps1
#
# Container : navi-savev2-pg  (image postgres:17-alpine, must already be present locally)
# Listen    : 127.0.0.1:55434 only
# Database  : navi_savev2_test, marked with COMMENT 'navi-savev2-synthetic-v1'
# Password  : random, stored in %LOCALAPPDATA%\navi-savev2\pg-password.txt and handed to
#             the container as a mounted file (POSTGRES_PASSWORD_FILE). Never printed.
# Never touches any other container (e.g. navi-e5-postgres17 on 55433).

$ErrorActionPreference = 'Stop'

$ContainerName = 'navi-savev2-pg'
$Image         = 'postgres:17-alpine'
$HostPort      = 55434
$Database      = 'navi_savev2_test'
$Marker        = 'navi-savev2-synthetic-v1'

if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set.' }
$SecretDir  = Join-Path $env:LOCALAPPDATA 'navi-savev2'
$SecretFile = Join-Path $SecretDir 'pg-password.txt'

function Wait-Healthy {
  for ($i = 0; $i -lt 60; $i++) {
    $status = (docker inspect --format '{{.State.Health.Status}}' $ContainerName)
    if ($status -eq 'healthy') { return }
    Start-Sleep -Seconds 2
  }
  throw "Container $ContainerName did not become healthy in time."
}

function Ensure-Database {
  $exists = (docker exec $ContainerName psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'")
  if ($LASTEXITCODE -ne 0) { throw 'psql check failed.' }
  if ("$exists".Trim() -ne '1') {
    docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $Database" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'CREATE DATABASE failed.' }
  }
  docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "COMMENT ON DATABASE $Database IS '$Marker'" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'COMMENT ON DATABASE failed.' }
}

$state = (docker ps -a --filter "name=^/$ContainerName$" --format '{{.State}}')
if ($LASTEXITCODE -ne 0) { throw 'docker ps failed - is Docker running?' }

if ($state -eq 'running') {
  Wait-Healthy
  Ensure-Database
  Write-Host "$ContainerName is already running and healthy on 127.0.0.1:$HostPort (database $Database)."
  exit 0
}

if ($state) {
  # Container exists but is stopped: restart it with its existing data and password.
  docker start $ContainerName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'docker start failed.' }
  Wait-Healthy
  Ensure-Database
  Write-Host "$ContainerName restarted and healthy on 127.0.0.1:$HostPort (database $Database)."
  exit 0
}

# Fresh container. Never pull: the image must already exist locally.
docker image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) { throw "Image $Image is not present locally; refusing to pull." }

New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
if (-not (Test-Path $SecretFile)) {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $password = ([Convert]::ToBase64String($bytes)).Replace('+', 'A').Replace('/', 'B').Replace('=', 'C')
  # No trailing newline; ASCII without BOM.
  [System.IO.File]::WriteAllText($SecretFile, $password, (New-Object System.Text.ASCIIEncoding))
  Remove-Variable password
}

docker run -d `
  --name $ContainerName `
  --restart no `
  -p "127.0.0.1:${HostPort}:5432" `
  -v "${SecretFile}:/run/secrets/pg_password:ro" `
  -e POSTGRES_PASSWORD_FILE=/run/secrets/pg_password `
  --health-cmd 'pg_isready -U postgres -d postgres' `
  --health-interval 2s `
  --health-timeout 3s `
  --health-retries 30 `
  $Image | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'docker run failed.' }

Wait-Healthy
Ensure-Database
Write-Host "$ContainerName started and healthy on 127.0.0.1:$HostPort (database $Database)."
