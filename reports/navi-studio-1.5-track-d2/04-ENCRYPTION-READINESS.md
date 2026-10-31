# Encryption Readiness

## Findings

- Windows `cipher /c C:\Users\Administrator\Documents\Codex` reported that new files added there will **not** be encrypted by EFS.
- `manage-bde -status C:` was attempted read-only, but Windows denied access because the current token lacks administrator rights. BitLocker status and recovery-key escrow are unverified.
- `age`, GPG, OpenSSL, and 7-Zip are absent from PATH. PowerShell `Protect-CmsMessage` is available, but the CurrentUser certificate store had no certificates with private keys.
- No credentials, persisted key, plaintext secret, or dump was generated. A fabricated one-line string completed an ephemeral .NET AES-GCM encrypt/decrypt/checksum round-trip; the in-memory test key and temporary ciphertext were cleared afterward.

## Prepared location

Empty directories were created outside the source repository:

`C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\`

with `backups`, `config`, and `logs` subdirectories. They are on C:; they are **not yet verified encrypted**. The `backups` directory is reserved for fabricated synthetic proof only until encryption is verified. Do not put real Dev exports there.

## Recommended mechanism and owner controls

Preferred: use an owner-approved BitLocker-protected volume with its recovery key stored separately in the organization’s recovery system; confirm `Protection Status: Protection On` and `Conversion Status: Fully Encrypted` before writing local secrets. Then create the local env file with the provided script, which restricts ACLs to the current user, SYSTEM, and local Administrators. This does not replace separate recovery-key custody.

If C: is not encrypted, the owner should select an approved encrypted removable volume or vault. Alternatively, install a vetted `age` release after source/version verification, generate a recipient key, and escrow the private identity separately. No installer or key generation was performed here. Do not rely on EFS without a separately backed-up recovery certificate. A 30-day retention period is a proposal only; owner must set retention and prevent deletion of the only verified backup.

The crypto primitive round-trip is **PASS**. It ran with `scripts/track-d2-local-recovery/Test-EncryptionRoundTrip.ps1`; output and SHA-256 are preserved in `09-LOCAL-VERIFICATION.log`. Encrypted backup-at-rest and recoverable-key-custody readiness remain **BLOCKED**. No actual synthetic database dump was available to encrypt, and the local DB dump/restore proof remains unexecuted. Real backups are explicitly out of scope.
