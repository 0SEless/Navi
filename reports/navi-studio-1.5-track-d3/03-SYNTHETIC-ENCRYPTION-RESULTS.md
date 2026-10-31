# Synthetic Encryption Results

## Result: PASS for ephemeral AES-GCM behavior

Ran `scripts/track-d2-local-recovery/Test-EncryptionRoundTrip.ps1` with a fabricated one-line payload. The enhanced script verified:

- successful AES-GCM encryption/decryption and exact plaintext/SHA-256 match;
- wrong-key rejection;
- ciphertext bit-flip/tamper rejection;
- test key stays in process memory and is cleared;
- plaintext is never written as a backup file;
- temporary ciphertext file is removed in `finally` and verified absent.

SHA-256 of the recovered fabricated payload: `f380eb580580e527ead1d6f5917ac351391249224da2dec5d2b2c86a636fc7d4`. Captured output is `encryption-check.log`; ciphertext did not remain. The key and encrypted payload were not persisted together; the test key was ephemeral and was not persisted anywhere.

This proves a synthetic .NET AES-GCM API round-trip only. It does **not** prove durable encryption of a PostgreSQL dump, key recovery, independent key custody, BitLocker at-rest status, or production backup readiness. `manage-bde -status C:` previously required an elevated token and was denied. No secret or real backup was generated.
