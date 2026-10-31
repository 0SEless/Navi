[CmdletBinding()]
param(
  [switch]$ConfirmStartSyntheticContainer,
  [string]$ConfigDirectory = 'C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\config',
  [string]$ArtifactDirectory = 'C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\backups',
  [string]$LogDirectory = 'C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\logs'
)
$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot '..\..'))
$artifactFullPath = [IO.Path]::GetFullPath($ArtifactDirectory)
$logFullPath = [IO.Path]::GetFullPath($LogDirectory)
if ($artifactFullPath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or $logFullPath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Synthetic dumps and logs must remain outside the source repository.'
}
$compose = Join-Path $scriptRoot 'compose.yaml'
$envFile = Join-Path $ConfigDirectory 'local.env'
$containerName = 'navi-d2-synthetic-postgis17'
$volumeName = 'navi-d2-synthetic-postgis17-data'
$networkName = 'navi-d2-synthetic-isolated'

if (-not $ConfirmStartSyntheticContainer) { throw 'Pass -ConfirmStartSyntheticContainer after Docker Desktop startup is approved.' }
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Local config is missing. Run Initialize-LocalConfig.ps1 only after encryption approval.' }
if (-not (Test-Path -LiteralPath $ArtifactDirectory)) { New-Item -ItemType Directory -Path $ArtifactDirectory | Out-Null }
if (-not (Test-Path -LiteralPath $LogDirectory)) { New-Item -ItemType Directory -Path $LogDirectory | Out-Null }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable. This script does not start Docker Desktop.' }
if (Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue) { throw 'TCP 55432 is occupied; no port changes will be made.' }
$containers = & docker ps -a --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Docker containers.' }
if ($containers -contains $containerName) { throw "Dedicated container name already exists ($containerName); refusing to reuse or replace it." }
$volumes = & docker volume ls --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Docker volumes.' }
if ($volumes -contains $volumeName) { throw "Dedicated volume already exists ($volumeName); refusing to reuse or replace it." }
$networks = & docker network ls --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Docker networks.' }
if ($networks -contains $networkName) { throw "Dedicated network already exists ($networkName); refusing to reuse it." }

$runId = [guid]::NewGuid().ToString('N')
$logPath = Join-Path $LogDirectory "synthetic-$runId.log"
Start-Transcript -Path $logPath | Out-Null
try {
  & docker compose --project-name navi-d2-synthetic --env-file $envFile -f $compose pull
  if ($LASTEXITCODE -ne 0) { throw 'Official PostGIS image pull failed.' }
  & docker compose --project-name navi-d2-synthetic --env-file $envFile -f $compose up -d
  if ($LASTEXITCODE -ne 0) { throw 'Dedicated synthetic container startup failed.' }
  $healthy = $false
  for ($i=0; $i -lt 80; $i++) {
    $state = & docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null
    if ($state -eq 'healthy') { $healthy = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $healthy) { throw 'Container did not become healthy within 160 seconds.' }

  $setup = Get-Content -Raw (Join-Path $scriptRoot 'synthetic\setup.sql')
  $setup | & docker exec -i $containerName psql -X -U postgres -d navi_synthetic -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic fixture setup failed.' }

  $postgis = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c "select postgis_lib_version()"
  if ($LASTEXITCODE -ne 0 -or -not $postgis) { throw 'PostGIS extension check failed.' }
  $transform = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c "select ST_SRID(ST_Transform(ST_SetSRID(ST_MakePoint(121,14),4326),3857))"
  if ($LASTEXITCODE -ne 0 -or $transform.Trim() -ne '3857') { throw 'ST_Transform synthetic check failed.' }
  $geometry = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c "select ST_Area(ST_Buffer(ST_SetSRID(ST_MakePoint(121,14),4326)::geography,25)) > 0"
  if ($LASTEXITCODE -ne 0 -or $geometry.Trim() -ne 't') { throw 'Geometry/geography operation failed.' }

  $select = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c "set role anon; select count(*) from public.synthetic_published_artifacts; reset role"
  $selectRows = @($select | Where-Object { "$_".Trim() -match '^\d+$' })
  if ($LASTEXITCODE -ne 0 -or $selectRows.Count -ne 1 -or [int]$selectRows[0].Trim() -ne 2) { throw 'Public read test failed.' }
  $denials = @(
    "set role authenticated; insert into public.synthetic_published_artifacts values ('must-deny','synthetic'); reset role",
    "set role authenticated; update public.synthetic_published_artifacts set body='must-deny' where artifact_id='synthetic-artifact-1'; reset role",
    "set role authenticated; delete from public.synthetic_published_artifacts where artifact_id='synthetic-artifact-1'; reset role"
  )
  foreach ($statement in $denials) {
    $denial = $statement | & docker exec -i $containerName psql -X -U postgres -d navi_synthetic -v ON_ERROR_STOP=1 2>&1
    if ($LASTEXITCODE -eq 0 -or (($denial -join "`n") -notmatch 'permission denied|row-level security')) { throw 'Authenticated direct DML did not fail as expected.' }
  }
  Write-Output 'PASS authenticated direct INSERT/UPDATE/DELETE denied'
  $trusted = 'set role service_role; insert into public.synthetic_published_artifacts values (''synthetic-server-write'',''fabricated server write''); reset role' | & docker exec -i $containerName psql -X -U postgres -d navi_synthetic -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Trusted service_role synthetic write failed.' }
  Write-Output 'PASS trusted local service_role write'

  $fk = "insert into public.synthetic_change_sets values ('synthetic-wrong-campus','00000000-0000-4000-8000-000000000001','building','wrong',1)" | & docker exec -i $containerName psql -X -U postgres -d navi_synthetic -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -eq 0 -or (($fk -join "`n") -notmatch 'foreign key constraint')) { throw 'Composite foreign key did not reject mismatched campus.' }
  Write-Output 'PASS composite FK rejected mismatched campus'

  $before = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c 'select count(*) from public.synthetic_published_artifacts'
  'begin; insert into public.synthetic_published_artifacts values (''rollback-only'',''synthetic''); rollback' | & docker exec -i $containerName psql -X -U postgres -d navi_synthetic -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Rollback transaction command failed.' }
  $after = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c 'select count(*) from public.synthetic_published_artifacts'
  if ($before.Trim() -ne $after.Trim()) { throw 'Rollback left a synthetic row behind.' }
  Write-Output 'PASS transaction rollback preserved row count'

  $checksum = & docker exec $containerName psql -X -A -t -U postgres -d navi_synthetic -c "select count(*)::text || ':' || md5(coalesce(string_agg(artifact_id || ':' || body, E'\n' order by artifact_id),'')) from public.synthetic_published_artifacts"
  $dumpInside = "/tmp/d2-synthetic-$runId.dump"
  & docker exec $containerName pg_dump -U postgres -Fc -d navi_synthetic -f $dumpInside
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic logical export failed.' }
  $dumpPath = Join-Path $ArtifactDirectory "synthetic-$runId.dump"
  & docker cp "${containerName}:$dumpInside" $dumpPath
  if ($LASTEXITCODE -ne 0) { throw 'Copy of synthetic dump to external test directory failed.' }
  $hashBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant()
  $restoreDb = "navi_restore_$($runId.Substring(0,10))"
  & docker exec $containerName createdb -U postgres $restoreDb
  if ($LASTEXITCODE -ne 0) { throw 'Could not create unique empty restore database.' }
  $insideRestore = "/tmp/d2-restore-$runId.dump"
  & docker cp $dumpPath "${containerName}:$insideRestore"
  if ($LASTEXITCODE -ne 0) { throw 'Could not stage synthetic dump in local container.' }
  & docker exec $containerName pg_restore -U postgres --no-owner -d $restoreDb $insideRestore
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic logical restore failed.' }
  $restored = & docker exec $containerName psql -X -A -t -U postgres -d $restoreDb -c "select count(*)::text || ':' || md5(coalesce(string_agg(artifact_id || ':' || body, E'\n' order by artifact_id),'')) from public.synthetic_published_artifacts"
  $hashAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant()
  if ($checksum.Trim() -ne $restored.Trim() -or $hashBefore -ne $hashAfter) { throw 'Restored synthetic row-count/checksum or dump checksum mismatch.' }
  Write-Output "PASS synthetic dump/restore; original=$($checksum.Trim()); restored=$($restored.Trim()); sha256=$hashAfter"
  Write-Output "Synthetic run log: $logPath"
} finally {
  Stop-Transcript | Out-Null
}
