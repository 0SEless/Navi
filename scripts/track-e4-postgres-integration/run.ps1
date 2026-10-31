param()

$ErrorActionPreference = 'Stop'
$script:CreatedSchema = $false
$script:WriterProcesses = @()
$script:DumpPath = $null
$script:PreviousPgPassword = $env:PGPASSWORD
$script:RunId = [Guid]::NewGuid().ToString('N')
$script:LogRoot = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'reports/navi-studio-1.5-track-e5-2/logs/e4-integration'
$script:RunLogDir = Join-Path $script:LogRoot "integration-$($script:RunId)"
$script:Docker = Get-Command docker -ErrorAction SilentlyContinue
$script:DockerContainer = 'navi-e5-postgres17'
$script:ContainerScriptDir = "/tmp/navi-e4-$($script:RunId)"
$script:ContainerDumpPath = "$($script:ContainerScriptDir)/synthetic.dump"
$script:ContainerRestorePath = "$($script:ContainerScriptDir)/restore.dump"

function Stop-Harness([string]$Message) {
  [Console]::Error.WriteLine("NAVI E4 PostgreSQL harness refused: $Message")
  exit 2
}

function Get-DockerExecPrefix([string]$Tool, [string]$ApplicationName = $env:PGAPPNAME) {
  $prefix = @('exec', '--env', 'PGPASSWORD')
  if ($ApplicationName) { $prefix += @('--env', "PGAPPNAME=$ApplicationName") }
  return $prefix + @($script:DockerContainer, $Tool)
}

function Copy-SqlFileToContainer([string]$SourcePath) {
  $destination = "$($script:ContainerScriptDir)/$([System.IO.Path]::GetFileName($SourcePath))"
  $copyOutput = & $script:Docker.Source cp $SourcePath "$($script:DockerContainer):$destination" 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not stage a reviewed E4 SQL input in the E5 container.' }
  return $destination
}

function Invoke-Psql([string[]]$PsqlArgs, [string]$Label) {
  $dockerArgs = (Get-DockerExecPrefix 'psql') + $PsqlArgs
  $output = & $script:Docker.Source @dockerArgs 2>&1
  $exitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath (Join-Path $script:RunLogDir "$Label.log")
  if ($exitCode -ne 0) {
    throw "psql step '$Label' failed with exit code $exitCode. See $script:RunLogDir."
  }
  return @($output | ForEach-Object { [string]$_ })
}

function Get-CommonPsqlArgs() {
  return @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', $env:NAVI_E4_PGUSER, '-d', $env:NAVI_E4_PGDATABASE)
}

function Get-LogicalFingerprint([string]$Label) {
  $query = @'
SELECT md5(
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id) FROM (SELECT campus_id, document_id, revision, head_checksum, created_by FROM navi_scoped.campus_heads) AS t), '') ||
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id, scope_kind, scope_id) FROM (SELECT campus_id, scope_kind, scope_id, revision, content_checksum, content_json FROM navi_scoped.scope_heads) AS t), '') ||
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id, revision) FROM (SELECT campus_id, revision, batch_checksum, before_head_checksum, after_head_checksum, operation_count, actor_id FROM navi_scoped.change_sets) AS t), '') ||
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id, revision, operation_index) FROM (SELECT campus_id, revision, operation_index, mutation_id, scope_kind, scope_id, before_checksum, after_checksum, content_json FROM navi_scoped.change_operations) AS t), '') ||
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id, revision, operation_index, dependency_index) FROM (SELECT campus_id, revision, operation_index, dependency_index, scope_kind, scope_id, expected_revision, expected_checksum, required FROM navi_scoped.change_dependencies) AS t), '') ||
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id, mutation_id) FROM (SELECT campus_id, mutation_id, request_checksum, content_checksum, revision, operation_index, batch_checksum FROM navi_scoped.mutation_receipts) AS t), '') ||
  COALESCE((SELECT string_agg(to_jsonb(t)::text, E'\n' ORDER BY campus_id, revision) FROM (SELECT campus_id, revision, format_version, scope_count, snapshot_checksum, snapshot_json FROM navi_scoped.checkpoints) AS t), '')
)
'@
  $output = Invoke-Psql ((Get-CommonPsqlArgs) + @('-A', '-t', '-c', $query)) $Label
  return (($output -join '').Trim())
}

if ($env:NAVI_E4_PG_INTEGRATION -cne '1') { Stop-Harness 'set NAVI_E4_PG_INTEGRATION=1 to opt in; no connection was attempted.' }
if ($env:NAVI_E4_PGHOST -cne '127.0.0.1') { Stop-Harness 'NAVI_E4_PGHOST must be 127.0.0.1 for the E5 synthetic endpoint.' }
if ($env:NAVI_E4_PGPORT -cne '55433') { Stop-Harness 'NAVI_E4_PGPORT must be the dedicated E5 loopback port 55433.' }
if ($env:NAVI_E4_PGDATABASE -cne 'navi_e4_test') { Stop-Harness 'NAVI_E4_PGDATABASE must equal the dedicated synthetic database navi_e4_test.' }
if ($env:NAVI_E4_PGUSER -cne 'navi_e4_runner') { Stop-Harness 'NAVI_E4_PGUSER must equal the restricted harness role navi_e4_runner.' }
if (-not $env:NAVI_E4_PGPASSWORD) { Stop-Harness 'NAVI_E4_PGPASSWORD must be supplied in the process environment, not a repository file.' }
$script:Docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $script:Docker) { Stop-Harness 'Docker CLI is required to use PostgreSQL 17 client tools inside the dedicated E5 container.' }
foreach ($toolName in @('psql', 'pg_dump', 'pg_restore')) {
  $versionOutput = & $script:Docker.Source exec $script:DockerContainer $toolName --version 2>&1
  if ($LASTEXITCODE -ne 0 -or [string]$versionOutput -notmatch '\b17\.') { Stop-Harness "$toolName inside navi-e5-postgres17 must be PostgreSQL 17." }
}

New-Item -ItemType Directory -Force -Path $script:RunLogDir | Out-Null
$env:PGPASSWORD = $env:NAVI_E4_PGPASSWORD
$commonArgs = Get-CommonPsqlArgs
$schemaCreatedByHarness = $false
try {
  $preflightQuery = @'
SELECT json_build_object(
  'database', current_database(),
  'databaseOwner', pg_get_userbyid(d.datdba),
  'databaseComment', shobj_description(d.oid, 'pg_database'),
  'role', session_user,
  'address', host(inet_server_addr()),
  'version', current_setting('server_version_num')::integer,
  'superuser', r.rolsuper,
  'createRole', r.rolcreaterole,
  'createDatabase', r.rolcreatedb,
  'databaseCreate', has_database_privilege(session_user, current_database(), 'CREATE'),
  'schemaExists', to_regnamespace('navi_scoped') IS NOT NULL,
  'supabaseRolePresent', EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role'))
)::text
FROM pg_roles AS r JOIN pg_database AS d ON d.datname = current_database()
WHERE r.rolname = session_user
  AND EXISTS (SELECT 1 FROM pg_database AS d WHERE d.datname = current_database())
'@
  $preflightLines = Invoke-Psql ($commonArgs + @('-A', '-t', '-c', $preflightQuery)) 'preflight'
  $identity = ($preflightLines -join '').Trim() | ConvertFrom-Json
  if ($identity.database -cne 'navi_e4_test' -or $identity.role -cne 'navi_e4_runner') { Stop-Harness 'connected database or session role identity did not match the dedicated harness target.' }
  if ($identity.databaseOwner -cne 'navi_e4_runner') { Stop-Harness 'the dedicated harness role must own the synthetic test database.' }
  if ($identity.databaseComment -cne 'navi-e4-synthetic-v1') { Stop-Harness 'the target database must carry the exact navi-e4-synthetic-v1 marker.' }
  if ($identity.address -notin @('127.0.0.1', '::1')) { Stop-Harness 'the PostgreSQL server did not report a loopback TCP address.' }
  if ([int]$identity.version -lt 170000 -or [int]$identity.version -ge 180000) { Stop-Harness 'the connected server is not PostgreSQL 17.' }
  if ($identity.superuser -or $identity.createRole -or $identity.createDatabase) { Stop-Harness 'the harness role must not be superuser, CREATEROLE, or CREATEDB.' }
  if (-not $identity.databaseCreate) { Stop-Harness 'the harness role needs CREATE on its dedicated test database to own the temporary schema.' }
  if ($identity.schemaExists) { Stop-Harness 'navi_scoped already exists; the harness refuses to reuse or overwrite it.' }
  if ($identity.supabaseRolePresent) { Stop-Harness 'standard Supabase API/service roles are present; use a standalone synthetic PostgreSQL cluster.' }

  $mkdirOutput = & $script:Docker.Source exec $script:DockerContainer mkdir -p $script:ContainerScriptDir 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the unique E5 client staging directory.' }
  $migrationSource = (Resolve-Path (Join-Path $PSScriptRoot '..\..\supabase\migrations\20261030045317_navi_scoped_persistence_foundation.sql')).Path
  $rollbackSource = (Resolve-Path (Join-Path $PSScriptRoot '..\..\supabase\rollback\20261030045317_navi_scoped_persistence_foundation.rollback.sql')).Path
  $script:MigrationContainerPath = Copy-SqlFileToContainer $migrationSource
  $script:RollbackContainerPath = Copy-SqlFileToContainer $rollbackSource
  $script:SeedContainerPath = Copy-SqlFileToContainer ((Resolve-Path (Join-Path $PSScriptRoot '01-seed-and-contracts.sql')).Path)
  $script:WriterAContainerPath = Copy-SqlFileToContainer ((Resolve-Path (Join-Path $PSScriptRoot '02-concurrent-writer-a.sql')).Path)
  $script:WriterBContainerPath = Copy-SqlFileToContainer ((Resolve-Path (Join-Path $PSScriptRoot '02-concurrent-writer-b.sql')).Path)
  $script:HistoryContainerPath = Copy-SqlFileToContainer ((Resolve-Path (Join-Path $PSScriptRoot '03-verify-history-and-rollback.sql')).Path)
  Invoke-Psql ($commonArgs + @('-f', $script:MigrationContainerPath)) 'migration-apply' | Out-Null
  $schemaCreatedByHarness = $true
  Invoke-Psql ($commonArgs + @('-f', $script:SeedContainerPath)) 'seed-and-contracts' | Out-Null

  $writerAOut = Join-Path $script:RunLogDir 'concurrent-writer-a.stdout.log'
  $writerAErr = Join-Path $script:RunLogDir 'concurrent-writer-a.stderr.log'
  $writerBOut = Join-Path $script:RunLogDir 'concurrent-writer-b.stdout.log'
  $writerBErr = Join-Path $script:RunLogDir 'concurrent-writer-b.stderr.log'
  $argsA = @('exec', '--env', 'PGPASSWORD', '--env', 'PGAPPNAME=navi-e4-writer-a', $script:DockerContainer, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', $env:NAVI_E4_PGUSER, '-d', $env:NAVI_E4_PGDATABASE, '-f', $script:WriterAContainerPath)
  $argsB = @('exec', '--env', 'PGPASSWORD', '--env', 'PGAPPNAME=navi-e4-writer-b', $script:DockerContainer, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', $env:NAVI_E4_PGUSER, '-d', $env:NAVI_E4_PGDATABASE, '-f', $script:WriterBContainerPath)
  $previousApplicationName = $env:PGAPPNAME
  $env:PGAPPNAME = 'navi-e4-writer-a'
  $processA = Start-Process -FilePath $script:Docker.Source -ArgumentList $argsA -WindowStyle Hidden -PassThru -RedirectStandardOutput $writerAOut -RedirectStandardError $writerAErr
  $script:WriterProcesses += $processA
  $lockQuery = "SELECT count(*) FROM pg_stat_activity WHERE usename = current_user AND application_name = 'navi-e4-writer-a' AND state = 'active' AND query LIKE '%pg_sleep%';"
  $lockConfirmed = $false
  $lockMarkerDeadline = (Get-Date).AddSeconds(10)
  do {
    Start-Sleep -Milliseconds 50
    $lockDockerArgs = (Get-DockerExecPrefix 'psql') + $commonArgs + @('-A', '-t', '-c', $lockQuery)
    $lockOutput = & $script:Docker.Source @lockDockerArgs 2>$null
    if ($LASTEXITCODE -eq 0 -and (($lockOutput -join '').Trim() -eq '1')) { $lockConfirmed = $true; break }
    if ($processA.HasExited) { throw 'Concurrent writer A exited before acquiring its campus lock.' }
  } while ((Get-Date) -lt $lockMarkerDeadline)
  if (-not $lockConfirmed) { throw 'Concurrent writer A did not reach its lock-held transaction within the readiness window.' }
  $env:PGAPPNAME = 'navi-e4-writer-b'
  $processB = Start-Process -FilePath $script:Docker.Source -ArgumentList $argsB -WindowStyle Hidden -PassThru -RedirectStandardOutput $writerBOut -RedirectStandardError $writerBErr
  $script:WriterProcesses += $processB
  if ($null -eq $previousApplicationName) { Remove-Item Env:PGAPPNAME -ErrorAction SilentlyContinue } else { $env:PGAPPNAME = $previousApplicationName }
  $processA.WaitForExit()
  $processB.WaitForExit()
  $processA.Refresh()
  $processB.Refresh()
  $writerBLog = (Get-Content -Raw $writerBOut) + (Get-Content -Raw $writerBErr)
  $writerALog = (Get-Content -Raw $writerAOut) + (Get-Content -Raw $writerAErr)
  $writerACommitted = $writerALog -match '(?m)^COMMIT\s*$'
  $writerBStale = $writerBLog -match 'E4_STALE_REVISION'
  $writerBCommitted = $writerBLog -match '(?m)^COMMIT\s*$'
  @(
    "writer_a_commit_observed=$writerACommitted"
    "writer_b_stale_revision_observed=$writerBStale"
    "writer_b_commit_observed=$writerBCommitted"
    'docker_process_exit_codes_omitted=true; Start-Process reports zero for docker exec child failures on this host.'
  ) | Set-Content -LiteralPath (Join-Path $script:RunLogDir 'concurrency-summary.log')
  if (-not $writerACommitted -or -not $writerBStale -or $writerBCommitted) { throw "The two-session lock/CAS check failed; see concurrency-summary.log in $script:RunLogDir." }

  $env:NAVI_E5_ADAPTER_INTEGRATION = '1'
  $env:NAVI_E5_PGHOST = '127.0.0.1'
  $env:NAVI_E5_PGPORT = '55433'
  $env:NAVI_E5_PGDATABASE = 'navi_e4_test'
  $env:NAVI_E5_PGUSER = 'navi_e4_runner'
  $env:NAVI_E5_PGPASSWORD = $env:NAVI_E4_PGPASSWORD
  $previousLocation = Get-Location
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $ErrorActionPreference = 'Continue'
    $adapterOutput = & npm.cmd exec -- vitest run --config .\scripts\track-e5-postgres-integration\vitest.config.mjs .\scripts\track-e5-postgres-integration\real-adapter.integration.test.mjs --reporter=verbose 2>&1
    $adapterExit = $LASTEXITCODE
  } finally {
    Set-Location $previousLocation
    $ErrorActionPreference = $previousErrorActionPreference
    Remove-Item Env:NAVI_E5_ADAPTER_INTEGRATION,Env:NAVI_E5_PGHOST,Env:NAVI_E5_PGPORT,Env:NAVI_E5_PGDATABASE,Env:NAVI_E5_PGUSER,Env:NAVI_E5_PGPASSWORD -ErrorAction SilentlyContinue
  }
  $adapterOutput | Set-Content -LiteralPath (Join-Path $script:RunLogDir 'real-adapter-vitest.log')
  if ($adapterExit -ne 0) { throw "Real PostgreSQL adapter integration test failed. See $script:RunLogDir." }

  Invoke-Psql ($commonArgs + @('-f', $script:HistoryContainerPath)) 'history-and-rollback' | Out-Null
  $beforeFingerprint = Get-LogicalFingerprint 'logical-fingerprint-before-restore'
  $script:DumpPath = Join-Path ([System.IO.Path]::GetTempPath()) "navi-e4-$($script:RunId).dump"
  $dumpArgs = (Get-DockerExecPrefix 'pg_dump') + @('--format=custom', '--schema=navi_scoped', '--no-owner', '--no-privileges', '--file', $script:ContainerDumpPath, '-h', '127.0.0.1', '-p', '5432', '-U', $env:NAVI_E4_PGUSER, '-d', $env:NAVI_E4_PGDATABASE)
  $dumpOutput = & $script:Docker.Source @dumpArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed. See $script:RunLogDir." }
  $copyOutput = & $script:Docker.Source cp "$($script:DockerContainer):$($script:ContainerDumpPath)" $script:DumpPath 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not transfer the custom-format E5 dump to the host.' }
  $containerHashOutput = & $script:Docker.Source exec $script:DockerContainer sha256sum $script:ContainerDumpPath 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not checksum the E5 container dump.' }
  $containerHashLine = (@($containerHashOutput | ForEach-Object { [string]$_ }) -join '').Trim()
  $containerHash = ($containerHashLine -split '\s+')[0].ToLowerInvariant()
  $hostHash = (Get-FileHash -LiteralPath $script:DumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  @("container_sha256=$containerHash", "host_sha256=$hostHash", "byte_identical=$($containerHash -eq $hostHash)") | Set-Content (Join-Path $script:RunLogDir 'synthetic-dump.sha256.log')
  if ($containerHash -ne $hostHash) { throw 'Custom-format dump bytes changed during container-to-host transfer.' }
  $listOutput = & $script:Docker.Source exec $script:DockerContainer pg_restore --list $script:ContainerDumpPath 2>&1
  $listExit = $LASTEXITCODE
  $listOutput | Set-Content (Join-Path $script:RunLogDir 'pg-restore-list.log')
  if ($listExit -ne 0 -or -not ($listOutput -match 'navi_scoped')) { throw 'The custom-format archive failed pg_restore --list validation.' }
  $copyBackOutput = & $script:Docker.Source cp $script:DumpPath "$($script:DockerContainer):$($script:ContainerRestorePath)" 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not transfer the verified dump back into the E5 container.' }
  $roundTripHashOutput = & $script:Docker.Source exec $script:DockerContainer sha256sum $script:ContainerRestorePath 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not checksum the host-to-container restore transfer.' }
  $roundTripHashLine = (@($roundTripHashOutput | ForEach-Object { [string]$_ }) -join '').Trim()
  $roundTripHash = ($roundTripHashLine -split '\s+')[0].ToLowerInvariant()
  Add-Content -LiteralPath (Join-Path $script:RunLogDir 'synthetic-dump.sha256.log') -Value "container_roundtrip_sha256=$roundTripHash"
  if ($roundTripHash -ne $hostHash) { throw 'Custom-format dump bytes changed during host-to-container restore transfer.' }

  Invoke-Psql ($commonArgs + @('-f', $script:RollbackContainerPath)) 'rollback-before-restore' | Out-Null
  $schemaCreatedByHarness = $false
  $restoreArgs = (Get-DockerExecPrefix 'pg_restore') + @('--exit-on-error', '--no-owner', '--no-privileges', '-h', '127.0.0.1', '-p', '5432', '-U', $env:NAVI_E4_PGUSER, '-d', $env:NAVI_E4_PGDATABASE, $script:ContainerRestorePath)
  $schemaCreatedByHarness = $true
  $restoreOutput = & $script:Docker.Source @restoreArgs 2>&1
  if ($LASTEXITCODE -ne 0) { $restoreOutput | Set-Content (Join-Path $script:RunLogDir 'restore.stderr.log'); throw "pg_restore failed. See $script:RunLogDir." }
  $schemaCreatedByHarness = $true
  $afterFingerprint = Get-LogicalFingerprint 'logical-fingerprint-after-restore'
  if ($beforeFingerprint -ne $afterFingerprint) { throw 'Logical fingerprint changed across synthetic dump/restore.' }
  Invoke-Psql ($commonArgs + @('-f', $script:RollbackContainerPath)) 'final-owned-schema-rollback' | Out-Null
  $schemaCreatedByHarness = $false
  Set-Content -LiteralPath (Join-Path $script:RunLogDir 'RESULT.txt') -Value @('PASS: PostgreSQL 17 synthetic schema apply, schema/role contracts, two-session advisory-lock/CAS, atomic rollback, history lineage, logical dump/restore fingerprint equality, and owned-schema rollback.', "Database: navi_e4_test; role: navi_e4_runner; server address: $($identity.address).", 'Synthetic test only; no Supabase or campus data.')
  Get-Content -Raw (Join-Path $script:RunLogDir 'RESULT.txt')
} catch {
  $failureRecord = @(
    "timestamp_utc=$([DateTime]::UtcNow.ToString('o'))"
    "error=$($_.Exception.Message)"
  )
  $failureRecord | Set-Content -LiteralPath (Join-Path $script:RunLogDir 'failure.log')
  foreach ($writer in $script:WriterProcesses) {
    if (-not $writer.HasExited) {
      Stop-Process -Id $writer.Id -Force -ErrorAction SilentlyContinue
      $writer.WaitForExit()
    }
  }
  if ($schemaCreatedByHarness) {
   try { Invoke-Psql ($commonArgs + @('-f', $script:RollbackContainerPath)) 'failure-cleanup-owned-schema' | Out-Null } catch { $_ | Out-String | Add-Content (Join-Path $script:RunLogDir 'failure-cleanup.log') }
  }
  throw
} finally {
  if ($script:DumpPath -and (Test-Path -LiteralPath $script:DumpPath)) { Remove-Item -LiteralPath $script:DumpPath -Force }
  if ($script:ContainerScriptDir -and $script:Docker -and $env:NAVI_E4_DOCKER_CLEANUP -eq '1') { & $script:Docker.Source exec $script:DockerContainer rm -rf $script:ContainerScriptDir 2>$null | Out-Null }
  if ($null -eq $script:PreviousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $script:PreviousPgPassword }
}
