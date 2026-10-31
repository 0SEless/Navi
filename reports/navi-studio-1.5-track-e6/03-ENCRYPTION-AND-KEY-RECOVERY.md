# Synthetic Encryption and Key-Recovery Rehearsal

## Result

**PASS for an independent non-DPAPI test mechanism; partial for independent custody.**

The E6 harness `logs/encryption-rehearsal.mjs` uses only invented JSON fixture data and Node built-in crypto:

- AES-256-GCM authenticated encryption.
- scrypt KDF with random 16-byte salt and N=32768, r=8, p=1.
- Random 12-byte nonce, explicit AAD, and authentication tag.
- Recovery secret is random test-only material, separate from the D5 DPAPI CurrentUser key.
- Decryption ran in a fresh Node child process after envelope creation; plaintext SHA-256 and byte count matched.
- Wrong-key and flipped-ciphertext tests were rejected.
- No plaintext file was written. Temporary secret and envelope files were removed in a `finally` cleanup. Log: `logs/encryption-rehearsal.log`.

The observed synthetic plaintext digest was `b6bf3cbd3ea96f5c356cbefa0c67c8fa11513e2d3267d342354bdb9875d17dc8`; it identifies only the fabricated test fixture.

## Limits and production key plan

The test proves a fresh process can decrypt without the D5 DPAPI profile-bound key. It ran under the same Windows account, and its short-lived test secret file lived in that account's temporary directory. It does **not** prove recovery from another Windows profile, another machine, offline media, or an independent custodian.

Before any real backup, use an owner-approved custody design: a randomly generated data-encryption key, authenticated envelope, and independently held recovery material (for example, split custody or an approved enterprise/offline secret store). Keep the recovery secret physically/logically separate from ciphertext and repository; identify custodians and access/recovery procedure; test recovery before deleting plaintext staging. Do not use D5 DPAPI as the only key path.

The D5 rehearsal remains distinct: it verified same-user DPAPI CurrentUser recovery of an existing synthetic D4.1 artifact, not independent escrow and not a fresh Development backup.

