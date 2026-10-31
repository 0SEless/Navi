# Track D4.1 — Requirements Before a Real Development Backup

The D4.1 synthetic recovery gate passed. A real Development backup is **not yet demonstrated or authorized by this proof**. No Supabase connection or export occurred.

Before a real Development backup, require:
1. A separate owner-authorized task naming the Development project and explicitly excluding Production.
2. Verified Development-only credentials and read-only export scope; no credentials in the repository.
3. Confirmed encrypted-at-rest storage destination, retention, access controls, and adequate capacity.
4. Confirmed recovery-key custody and tested access to the key; the AES-GCM API test used a random in-memory key and is not this evidence.
5. An approved export format and restore target that cannot reach Production or Supabase.
6. A real-backup encryption and integrity procedure with a successful restore rehearsal in an isolated target.
7. Resolution of the localhost port-forwarding discrepancy if host TCP connectivity is required. Current database checks used docker exec; 127.0.0.1:55432 was not reachable.

The synthetic .dump artifact is plaintext and contains only fabricated rows. It is kept outside the repository in the D2 backups directory.
