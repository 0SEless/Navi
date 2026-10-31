[CmdletBinding()]
param(
  [switch]$ConfirmRecoveryKeyCustody,
  [string]$ConfigDirectory = 'C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\config'
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$configFullPath = [IO.Path]::GetFullPath($ConfigDirectory)
if ($configFullPath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Credential files must remain outside the source repository.'
}

if (-not $ConfirmRecoveryKeyCustody) {
  throw 'Confirm separate BitLocker recovery-key custody before writing the local credential file.'
}
$status = (& manage-bde -status C: 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $status -notmatch 'Conversion Status:\s+Fully Encrypted' -or $status -notmatch 'Protection Status:\s+Protection On') {
  throw 'C: encryption is not verified as fully encrypted with protection on. No credential file was created.'
}
if (-not (Test-Path -LiteralPath $configFullPath)) {
  New-Item -ItemType Directory -Path $configFullPath | Out-Null
}
$envFile = Join-Path $configFullPath 'local.env'
if (Test-Path -LiteralPath $envFile) {
  throw "Refusing to overwrite existing local config: $envFile"
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($principal in @($sid, 'S-1-5-18', 'S-1-5-32-544')) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
  )
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $ConfigDirectory -AclObject $acl

$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_'
$password = -join ($bytes | ForEach-Object { $alphabet[[int]$_ % $alphabet.Length] })
[Array]::Clear($bytes, 0, $bytes.Length)
$contents = @(
  'D2_CONTAINER_NAME=navi-d2-synthetic-postgis17'
  'D2_VOLUME_NAME=navi-d2-synthetic-postgis17-data'
  'D2_NETWORK_NAME=navi-d2-synthetic-isolated'
  'POSTGRES_DB=navi_synthetic'
  'POSTGRES_USER=postgres'
  "POSTGRES_PASSWORD=$password"
) -join "`n"
[IO.File]::WriteAllText($envFile, $contents + "`n", [Text.UTF8Encoding]::new($false))
$fileAcl = Get-Acl -LiteralPath $envFile
$fileAcl.SetAccessRuleProtection($true, $false)
foreach ($principal in @($sid, 'S-1-5-18', 'S-1-5-32-544')) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'Allow')
  $fileAcl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $envFile -AclObject $fileAcl
Write-Output "Created restricted local configuration at $envFile; password value was not displayed."
