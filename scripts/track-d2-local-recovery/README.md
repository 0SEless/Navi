# Track D2 Local Recovery Scripts

These scripts are for the isolated synthetic PostgreSQL/PostGIS exercise. They contain no Supabase connection URL and do not connect to Vercel or Supabase.

## Sequence after approval

1. Resolve Docker startup gate in `reports/navi-studio-1.5-track-d2/08-APPROVAL-GATES.md`. Start Docker Desktop only after unrelated-container behavior is accepted or inventoried.
2. Run elevated `manage-bde -status C:`. If C: is fully encrypted, Protection On, and recovery-key escrow is confirmed separately, run:

   ```powershell
   .\scripts\track-d2-local-recovery\Initialize-LocalConfig.ps1 -ConfirmRecoveryKeyCustody
   ```

   This creates an ACL-restricted random `local.env` outside the repo and refuses to overwrite an existing file. It never prints the password.
3. Run the synthetic proof:

   ```powershell
   .\scripts\track-d2-local-recovery\Invoke-SyntheticProof.ps1 -ConfirmStartSyntheticContainer
   ```

   The script requires a working Docker daemon, free TCP 55432, and unused dedicated container/volume names. It will pull the upstream PostGIS 17 image and create a new synthetic-only container/volume. It refuses collisions and does not prune/delete any Docker resource.
4. Review the log under the external recovery `logs` directory and the synthetic dump under `backups`. Those artifacts use fabricated data only. A real Dev backup requires a separate approved task.

The separate `Test-EncryptionRoundTrip.ps1` test uses an ephemeral in-memory key only for a fabricated short payload and deletes temporary ciphertext; it is not a persistent backup encryption solution.
