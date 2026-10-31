$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$reportRoot = Join-Path $repoRoot 'reports/navi-studio-1.5-track-e8-5'
$runId = [Guid]::NewGuid().ToString('N')
$campusId = "navi-e8-browser-$($runId.Substring(0, 16))"
$logDir = Join-Path $reportRoot "logs/run-$runId"
$secretFile = 'C:\Users\Administrator\Documents\Codex\NAVI-E5-Secrets\navi_e4_runner_password'
$expectedImage = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
$playwright = Join-Path $repoRoot 'node_modules/.bin/playwright.cmd'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

try {
  $context = (& docker context show 2>&1 | Out-String).Trim()
  $engine = (& docker info --format '{{.ServerVersion}}' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $context -ne 'desktop-linux' -or $engine -ne '29.8.1') { throw 'Docker context or engine identity did not match the verified E5 environment.' }
  $containerRaw = & docker inspect navi-e5-postgres17 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'The named E5 PostgreSQL container could not be inspected.' }
  $container = (($containerRaw -join "`n") | ConvertFrom-Json)[0]
  $networkRaw = & docker network inspect navi-e5-postgres17-net 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'The E5-only network could not be inspected.' }
  $network = (($networkRaw -join "`n") | ConvertFrom-Json)[0]
  $networkContainerIds = @($network.Containers.PSObject.Properties.Name)
  $volumeRaw = & docker volume inspect navi-e5-postgres17-data 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'The protected E5 volume could not be inspected.' }
  $volume = (($volumeRaw -join "`n") | ConvertFrom-Json)[0]
  $portBinding = $container.HostConfig.PortBindings.'5432/tcp'
  $volumeMount = $container.Mounts | Where-Object { $_.Type -eq 'volume' -and $_.Name -eq 'navi-e5-postgres17-data' -and $_.Destination -eq '/var/lib/postgresql/data' }
  if ($container.State.Running -ne $true -or $container.Config.Image -ne $expectedImage -or $container.HostConfig.RestartPolicy.Name -ne 'no') { throw 'E5 container identity, running state, image digest, or restart policy failed verification.' }
  if ($portBinding.Count -ne 1 -or $portBinding[0].HostIp -ne '127.0.0.1' -or $portBinding[0].HostPort -ne '55433') { throw 'The E5 container is not bound exclusively to localhost:55433.' }
  if (-not $volumeMount -or $volume.Name -ne 'navi-e5-postgres17-data') { throw 'The E5 volume identity or persistent mount does not match the approved resource.' }
  if ($network.Name -ne 'navi-e5-postgres17-net' -or $network.Driver -ne 'bridge' -or $network.Internal -ne $false -or $networkContainerIds.Count -ne 1 -or $networkContainerIds[0] -ne $container.Id) { throw 'The E5 container is not isolated on its expected dedicated bridge network.' }
  if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 55433 -InformationLevel Quiet)) { throw 'Windows host cannot reach the approved localhost E5 port.' }
  if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) { throw 'The protected synthetic E5 runner credential is unavailable.' }
  if (-not (Test-Path -LiteralPath $playwright -PathType Leaf)) { throw 'The repository-local Playwright executable is missing; no install was attempted.' }

  $dockerDf = & docker system df 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Read-only Docker disk inventory failed.' }
  $inventory = [ordered]@{
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    context = $context
    engine = $engine
    container = [ordered]@{
      id = $container.Id
      name = $container.Name.TrimStart('/')
      image = $container.Config.Image
      imageId = $container.Image
      status = $container.State.Status
      restartPolicy = $container.HostConfig.RestartPolicy.Name
      portBindings = $container.HostConfig.PortBindings
      namedMount = [ordered]@{ name = $volume.Name; destination = $volumeMount.Destination }
    }
    network = [ordered]@{ name = $network.Name; driver = $network.Driver; internal = $network.Internal; containers = $networkContainerIds }
    dockerDisk = @($dockerDf | ForEach-Object { [string]$_ })
    windowsCFreeBytes = (Get-PSDrive -Name C).Free
    hostPort55433Available = $true
    d2ResourcesInspectedOrChanged = $false
  }
  $inventory | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $logDir 'e5-readonly-preflight.json')

  $password = (Get-Content -LiteralPath $secretFile -Raw).TrimEnd("`r", "`n")
  if ($password -notmatch '^[A-Za-z0-9+/=]{64}$') { throw 'Synthetic E5 runner credential format did not validate.' }
  $env:NAVI_E5_PG_HOST = '127.0.0.1'
  $env:NAVI_E5_PG_PORT = '55433'
  $env:NAVI_E5_PG_DATABASE = 'navi_e4_test'
  $env:NAVI_E5_PG_USER = 'navi_e4_runner'
  $env:NAVI_E5_PG_PASSWORD = $password
  $env:NAVI_E8_BROWSER_CAMPUS_ID = $campusId
  $env:NAVI_E85_PLAYWRIGHT_OUTPUT = Join-Path $logDir 'playwright-output'
  Remove-Variable password

  $env:NO_COLOR = $null
  $env:FORCE_COLOR = $null
  $ErrorActionPreference = 'Continue'
  $output = & $playwright test --config (Join-Path $repoRoot 'playwright.track-e8-5.config.ts') --reporter=list 2>&1
  $exitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath (Join-Path $logDir 'playwright.log')
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) { throw "E8.5 synthetic browser acceptance failed; retained evidence is in $logDir." }
  Write-Output "E8.5 synthetic Studio/E5/compiler/runtime acceptance passed. Campus: $campusId. Logs: $logDir"
} catch {
  Write-Output "E8.5 synthetic acceptance stopped: $($_.Exception.Message)"
  Write-Output "Logs retained: $logDir"
  exit 2
} finally {
  $env:NAVI_E5_PG_PASSWORD = $null
  $env:NAVI_E8_BROWSER_CAMPUS_ID = $null
  $env:NAVI_E85_PLAYWRIGHT_OUTPUT = $null
}
