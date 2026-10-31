param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedRoot = 'C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027'
if ($repoRoot -ne $expectedRoot) { throw 'E7 runner refused an unexpected workspace.' }

$secretPath = 'C:\Users\Administrator\Documents\Codex\NAVI-E5-Secrets\navi_e4_runner_password'
if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) { throw 'The protected E5 runner credential file is unavailable.' }
$env:TEMP = $repoRoot + '\.tmp-vitest'
$env:TMP = $env:TEMP
$env:NAVI_E7_PG_INTEGRATION = '1'
$env:NAVI_E5_PGHOST = '127.0.0.1'
$env:NAVI_E5_PGPORT = '55433'
$env:NAVI_E5_PGDATABASE = 'navi_e4_test'
$env:NAVI_E5_PGUSER = 'navi_e4_runner'
$env:NAVI_E5_PGPASSWORD = [System.IO.File]::ReadAllText($secretPath).Trim()

$logDir = Join-Path $repoRoot 'reports\navi-studio-1.5-track-e7\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir 'postgres-editor-workflow.log'
try {
  Push-Location $repoRoot
  try {
    & npm exec -- vitest run --config scripts/track-e7-postgres-integration/vitest.config.mjs --reporter=verbose 2>&1 |
      Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw "E7 PostgreSQL integration failed with exit code $LASTEXITCODE. See reports/navi-studio-1.5-track-e7/logs/postgres-editor-workflow.log." }
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:NAVI_E5_PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:NAVI_E7_PG_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:NAVI_E5_PGHOST -ErrorAction SilentlyContinue
  Remove-Item Env:NAVI_E5_PGPORT -ErrorAction SilentlyContinue
  Remove-Item Env:NAVI_E5_PGDATABASE -ErrorAction SilentlyContinue
  Remove-Item Env:NAVI_E5_PGUSER -ErrorAction SilentlyContinue
}
