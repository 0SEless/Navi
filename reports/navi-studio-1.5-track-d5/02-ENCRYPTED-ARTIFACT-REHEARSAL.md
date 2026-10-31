# Track D5 — Encrypted Artifact Rehearsal

## Scope and source

This rehearsal encrypted the existing fabricated D4.1 custom-format dump at:

`C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\backups\synthetic-d4.1-ceb23469c0874825994c3d92b1c39f8c.dump`

This is **not a fresh D5 database dump**. Docker was unavailable, so no D5 database connection or dump was performed.

## Results

| Check | Result |
|---|---|
| Source length | 14,373 bytes |
| Source SHA-256 | `8c899e509aaa696a2dddaea373e660199fb03ab5e45639bfd4318e49a090c1c2` |
| Ciphertext | `C:\Users\Administrator\Documents\Codex\NAVI-Track-D5-Recovery\ciphertext\synthetic-d4.1-rehearsal.aesgcm` |
| Ciphertext length | 14,401 bytes (12-byte nonce + 16-byte tag + ciphertext) |
| Ciphertext SHA-256 | `988ba11bb42e95504bcc31eed4232f1dd098655a6ecec9bc913eb7bdc050b04e` |
| Key file | `C:\Users\Administrator\Documents\Codex\NAVI-Track-D5-Recovery\key-custody\synthetic-test-key.dpapi.bin` |
| Key recovery | PASS in a separate `pwsh` process using Windows DPAPI `CurrentUser` under the same user account |
| Decrypted length and SHA-256 | Matched source |
| Wrong-key rejection | PASS |
| Modified-ciphertext rejection | PASS |
| Temporary decrypted plaintext | Deleted after hash verification |

The key directory inherits the `C:\Users\Administrator\Documents\Codex` ACL: SYSTEM, local Administrators, and the Administrator user have Full Control. Ciphertext and key are outside the repository and in separate directories. Exact run log: `C:\Users\Administrator\Documents\Codex\NAVI-Track-D5-Recovery\encryption-rehearsal.log`.

The first recovery attempt used a PowerShell SecureString wrapper and failed because the child Windows PowerShell process could not load its security module. No pass was claimed from that attempt. The rehearsal was rerun using a binary DPAPI-protected key and a fresh `pwsh` process; the recovery and integrity checks above passed.

## Custody limitation

DPAPI `CurrentUser` is a same-Windows-user test mechanism, not independent disaster recovery, portable escrow, or a production key-management policy. If the profile or DPAPI master keys are lost, this test key may be unrecoverable. A real backup needs an owner-approved independent key custodian and a separately tested recovery procedure. The original D4.1 plaintext evidence artifact remains unchanged; it was not a D5 staging file and was not deleted.
