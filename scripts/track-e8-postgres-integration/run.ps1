$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logRoot = Join-Path $repoRoot 'reports/navi-studio-1.5-track-e8/logs'
$runId = [Guid]::NewGuid().ToString('N')
$logDir = Join-Path $logRoot "integration-$runId"
$secretFile = 'C:\Users\Administrator\Documents\Codex\NAVI-E5-Secrets\navi_e4_runner_password'
$containerName = 'navi-e5-postgres17'
$expectedImage = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$transcriptPath = Join-Path $logDir 'runner.log'
Start-Transcript -LiteralPath $transcriptPath | Out-Null

try {
  $context = (& docker context show 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $context -ne 'desktop-linux') { throw 'Docker context is not the verified desktop-linux context.' }
  $inspectRaw = & docker inspect $containerName 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'The protected E5 container could not be inspected.' }
  $container = (($inspectRaw -join "`n") | ConvertFrom-Json)[0]
  if ($container.State.Running -ne $true -or $container.Config.Image -ne $expectedImage -or $container.HostConfig.RestartPolicy.Name -ne 'no') { throw 'The E5 container state, image digest, or restart policy differs from the approved identity.' }
  if ($container.HostConfig.PortBindings.'5432/tcp'.Count -ne 1 -or $container.HostConfig.PortBindings.'5432/tcp'[0].HostIp -ne '127.0.0.1' -or $container.HostConfig.PortBindings.'5432/tcp'[0].HostPort -ne '55433') { throw 'The E5 PostgreSQL port binding is not exactly localhost:55433.' }
  if (-not ($container.Mounts | Where-Object { $_.Type -eq 'volume' -and $_.Name -eq 'navi-e5-postgres17-data' -and $_.Destination -eq '/var/lib/postgresql/data' })) { throw 'The expected protected E5 data volume is not mounted.' }
  if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) { throw 'The protected E5 runner credential file is unavailable.' }
  $runnerPassword = (Get-Content -LiteralPath $secretFile -Raw).TrimEnd("`r", "`n")
  if ($runnerPassword -notmatch '^[A-Za-z0-9+/=]{64}$') { throw 'The E5 runner secret format did not match the generated synthetic credential.' }

  $env:NAVI_E5_PGHOST = '127.0.0.1'
  $env:NAVI_E5_PGPORT = '55433'
  $env:NAVI_E5_PGDATABASE = 'navi_e4_test'
  $env:NAVI_E5_PGUSER = 'navi_e4_runner'
  $env:NAVI_E5_PGPASSWORD = $runnerPassword
  $env:NAVI_E8_SYNTHETIC_CAMPUS = "navi-e8-synthetic-$runId"
  $env:NODE_ENV = 'test'
  Remove-Variable runnerPassword

  $vitest = Join-Path $repoRoot 'node_modules/.bin/vitest.cmd'
  $config = Join-Path $PSScriptRoot 'vitest.config.mjs'
  if (-not (Test-Path -LiteralPath $vitest)) { throw 'The repository-local Vitest executable is unavailable; no dependency installation was attempted.' }
  $ErrorActionPreference = 'Continue'
  foreach ($mode in @('write', 'read')) {
    $env:NAVI_E8_INTEGRATION_MODE = $mode
    $output = & $vitest run --config $config --reporter=dot 2>&1
    $exitCode = $LASTEXITCODE
    $output | Set-Content -LiteralPath (Join-Path $logDir "$mode.log")
    if ($exitCode -ne 0) { throw "The isolated E8 $mode worker failed. See $logDir." }
    Write-Output ($output -join "`n")
  }
  $ErrorActionPreference = 'Stop'
  Write-Output "E8 E5 synthetic proof logs: $logDir"
} catch {
  Write-Output "E8 synthetic proof stopped: $($_.Exception.Message)"
  Write-Output "Retained logs: $logDir"
  exit 2
} finally {
  $env:NAVI_E5_PGPASSWORD = $null
  $env:NAVI_E8_SYNTHETIC_CAMPUS = $null
  $env:NAVI_E8_INTEGRATION_MODE = $null
  Stop-Transcript | Out-Null
}
