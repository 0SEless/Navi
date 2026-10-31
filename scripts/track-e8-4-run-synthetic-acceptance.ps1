$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:NO_COLOR = $null
$env:FORCE_COLOR = $null
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$reportRoot = Join-Path $repoRoot 'reports/navi-studio-1.5-track-e8-4'
$runId = [Guid]::NewGuid().ToString('N')
$logDir = Join-Path $reportRoot "logs/run-$runId"
$secretFile = 'C:\Users\Administrator\Documents\Codex\NAVI-E5-Secrets\navi_e4_runner_password'
$containerName = 'navi-e5-postgres17'
$expectedImage = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
$playwright = Join-Path $repoRoot 'node_modules/.bin/playwright.cmd'
$vitest = Join-Path $repoRoot 'node_modules/.bin/vitest.cmd'
$config = Join-Path $repoRoot 'scripts/track-e8-browser-acceptance/vitest.config.mjs'
$campusId = "navi-e8-browser-$($runId.Substring(0, 16))"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

try {
  $context = (& docker context show 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $context -ne 'desktop-linux') { throw 'Docker context is not desktop-linux.' }
  $inspectRaw = & docker inspect $containerName 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'The approved E5 container could not be inspected.' }
  $container = (($inspectRaw -join "`n") | ConvertFrom-Json)[0]
  if ($container.State.Running -ne $true -or $container.Config.Image -ne $expectedImage -or $container.HostConfig.RestartPolicy.Name -ne 'no') { throw 'E5 container state, digest, or restart policy does not match the approved synthetic identity.' }
  $ports = $container.HostConfig.PortBindings.'5432/tcp'
  if ($ports.Count -ne 1 -or $ports[0].HostIp -ne '127.0.0.1' -or $ports[0].HostPort -ne '55433') { throw 'E5 is not bound only to 127.0.0.1:55433.' }
  if (-not ($container.Mounts | Where-Object { $_.Type -eq 'volume' -and $_.Name -eq 'navi-e5-postgres17-data' -and $_.Destination -eq '/var/lib/postgresql/data' })) { throw 'The protected E5 volume mount differs from the approved identity.' }
  if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) { throw 'The protected synthetic E5 runner credential file is unavailable.' }
  if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 55433 -InformationLevel Quiet)) { throw 'The authorized local E5 endpoint is not reachable.' }
  if (-not (Test-Path -LiteralPath $vitest) -or -not (Test-Path -LiteralPath $playwright)) { throw 'Repository-local test executables are unavailable; no install was attempted.' }

  $password = (Get-Content -LiteralPath $secretFile -Raw).TrimEnd("`r", "`n")
  if ($password -notmatch '^[A-Za-z0-9+/=]{64}$') { throw 'The synthetic runner secret format is invalid.' }
  $env:NAVI_E5_PG_HOST = '127.0.0.1'
  $env:NAVI_E5_PG_PORT = '55433'
  $env:NAVI_E5_PG_DATABASE = 'navi_e4_test'
  $env:NAVI_E5_PG_USER = 'navi_e4_runner'
  $env:NAVI_E5_PG_PASSWORD = $password
  $env:NAVI_E8_BROWSER_CAMPUS_ID = $campusId
  $env:NAVI_E8_BROWSER_FIXTURE = 'e84'
  $env:NAVI_E8_BROWSER_EXPECTED_REVISION = '1'
  $env:NODE_ENV = 'test'
  Remove-Variable password

  $env:NAVI_E8_BROWSER_DB_MODE = 'bootstrap'
  # Capture child-process stderr into the retained logs; validate each exit code below.
  $ErrorActionPreference = 'Continue'
  $output = & $vitest run --config $config --reporter=dot 2>&1
  $exitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath (Join-Path $logDir 'bootstrap-postgres.log')
  if ($exitCode -ne 0) { throw "Synthetic E5 bootstrap failed; logs retained at $logDir." }

  $playwrightOutput = & $playwright test --config (Join-Path $repoRoot 'playwright.track-e8-4.config.ts') 2>&1
  $playwrightExit = $LASTEXITCODE
  $playwrightOutput | Set-Content -LiteralPath (Join-Path $logDir 'playwright.log')
  if ($playwrightExit -ne 0) { throw "The E8.4 Playwright acceptance failed; logs retained at $logDir." }

  $env:NAVI_E8_BROWSER_DB_MODE = 'verify'
  $verifyOutput = & $vitest run --config $config --reporter=dot 2>&1
  $verifyExit = $LASTEXITCODE
  $verifyOutput | Set-Content -LiteralPath (Join-Path $logDir 'verify-postgres.log')
  if ($verifyExit -ne 0) { throw "Independent synthetic E5 verification failed; logs retained at $logDir." }
  $ErrorActionPreference = 'Stop'
  Write-Output "E8.4 synthetic browser/PostgreSQL acceptance completed. Campus: $campusId. Logs: $logDir"
} catch {
  Write-Output "E8.4 synthetic acceptance stopped: $($_.Exception.Message)"
  Write-Output "Logs retained: $logDir"
  exit 2
} finally {
  $env:NAVI_E5_PG_PASSWORD = $null
  $env:NAVI_E8_BROWSER_CAMPUS_ID = $null
  $env:NAVI_E8_BROWSER_FIXTURE = $null
  $env:NAVI_E8_BROWSER_EXPECTED_REVISION = $null
  $env:NAVI_E8_BROWSER_DB_MODE = $null
}
