[CmdletBinding()]
param([string]$WorkDirectory = 'C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\logs')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workFullPath = [IO.Path]::GetFullPath($WorkDirectory)
if ($workFullPath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Temporary encryption test files must remain outside the source repository.'
}
if (-not (Test-Path -LiteralPath $workFullPath)) { New-Item -ItemType Directory -Path $workFullPath | Out-Null }
$payload = [Text.Encoding]::UTF8.GetBytes('NAVI D2 fabricated encryption round-trip fixture; contains no real records.')
$key = New-Object byte[] 32
$wrongKey = New-Object byte[] 32
$nonce = New-Object byte[] 12
$tag = New-Object byte[] 16
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$file = Join-Path $workFullPath ('synthetic-crypto-' + [guid]::NewGuid().ToString('N') + '.bin')
try {
  $rng.GetBytes($key); $rng.GetBytes($wrongKey); $rng.GetBytes($nonce)
  while ([Linq.Enumerable]::SequenceEqual[byte]($key, $wrongKey)) { $rng.GetBytes($wrongKey) }
  $cipher = New-Object byte[] $payload.Length
  $aes = [Security.Cryptography.AesGcm]::new($key, 16)
  try { $aes.Encrypt($nonce, $payload, $cipher, $tag) } finally { $aes.Dispose() }
  $blob = New-Object byte[] (4 + $nonce.Length + $tag.Length + $cipher.Length)
  [Array]::Copy([byte[]](0x4e,0x41,0x56,0x49), 0, $blob, 0, 4)
  [Array]::Copy($nonce, 0, $blob, 4, $nonce.Length)
  [Array]::Copy($tag, 0, $blob, 4 + $nonce.Length, $tag.Length)
  [Array]::Copy($cipher, 0, $blob, 4 + $nonce.Length + $tag.Length, $cipher.Length)
  [IO.File]::WriteAllBytes($file, $blob)
  $read = [IO.File]::ReadAllBytes($file)
  if ([Text.Encoding]::ASCII.GetString($read,0,4) -ne 'NAVI') { throw 'Ciphertext framing check failed.' }
  $readNonce = New-Object byte[] 12; $readTag = New-Object byte[] 16
  $readCipher = New-Object byte[] ($read.Length - 32)
  [Array]::Copy($read,4,$readNonce,0,12); [Array]::Copy($read,16,$readTag,0,16); [Array]::Copy($read,32,$readCipher,0,$readCipher.Length)
  $clear = New-Object byte[] $readCipher.Length
  $aes = [Security.Cryptography.AesGcm]::new($key,16)
  try { $aes.Decrypt($readNonce,$readCipher,$readTag,$clear) } finally { $aes.Dispose() }
  $before = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($payload))
  $after = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($clear))
  if ($before -ne $after -or [Text.Encoding]::UTF8.GetString($clear) -ne [Text.Encoding]::UTF8.GetString($payload)) { throw 'Synthetic plaintext/checksum mismatch after decrypt.' }
  Write-Output "PASS ephemeral AES-GCM synthetic round-trip; sha256=$($after.ToLowerInvariant()); ciphertext-bytes=$($read.Length)"
  $wrongClear = New-Object byte[] $readCipher.Length
  $wrongKeyRejected = $false
  $aes = [Security.Cryptography.AesGcm]::new($wrongKey,16)
  try { $aes.Decrypt($readNonce,$readCipher,$readTag,$wrongClear) }
  catch [Security.Cryptography.CryptographicException] { $wrongKeyRejected = $true }
  finally { $aes.Dispose() }
  if (-not $wrongKeyRejected) { throw 'Wrong key was not rejected.' }
  Write-Output 'PASS wrong-key rejection'
  $tampered = $readCipher.Clone()
  $tampered[0] = $tampered[0] -bxor 1
  $tamperedClear = New-Object byte[] $tampered.Length
  $tamperRejected = $false
  $aes = [Security.Cryptography.AesGcm]::new($key,16)
  try { $aes.Decrypt($readNonce,$tampered,$readTag,$tamperedClear) }
  catch [Security.Cryptography.CryptographicException] { $tamperRejected = $true }
  finally { $aes.Dispose() }
  if (-not $tamperRejected) { throw 'Tampered ciphertext was not rejected.' }
  Write-Output 'PASS ciphertext tamper detection'
  Write-Output 'The random key existed only in process memory and was not persisted. This is a crypto API test, not at-rest backup encryption or key custody proof.'
} finally {
  if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  [Array]::Clear($key,0,$key.Length); [Array]::Clear($wrongKey,0,$wrongKey.Length); [Array]::Clear($payload,0,$payload.Length); [Array]::Clear($nonce,0,$nonce.Length); [Array]::Clear($tag,0,$tag.Length)
  $rng.Dispose()
}
if (Test-Path -LiteralPath $file) { throw 'Temporary ciphertext was not removed.' }
Write-Output 'PASS no plaintext backup file retained; temporary ciphertext removed.'
