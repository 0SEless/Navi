# Concurrency and Security Results

**Status: synthetic E5 checks passed.**

- Two concurrent PostgreSQL sessions used the same base revision under the E4 advisory-lock/CAS protocol. Writer A emitted `COMMIT`; writer B emitted `E4_STALE_REVISION` and no `COMMIT`. The log records these observed SQL outcomes.
- The harness originally relied on `Start-Process docker.exe` exit codes, which on this Windows host returned zero even for `docker exec ... sh -c 'exit 7'`. The assertion now checks the actual psql commit/error output, not that unreliable wrapper exit code. Evidence is in `concurrency-summary.log` and both writer logs.
- Database and login role are exact E5-only resources. The runner is not superuser, has no `CREATEDB`, `CREATEROLE`, or `BYPASSRLS`, and has only the privileges required for the owned synthetic schema.
- Credentials are generated synthetic secrets kept outside the repository in an ACL-restricted directory. No secret values appear in reports or saved logs.
- E5 uses a dedicated bridge with IP masquerading disabled and publishes PostgreSQL only on `127.0.0.1:55433`. The setting supports this observed host-to-container path but is not a complete egress policy.
- No Supabase roles exist in the synthetic cluster. D2 resources, anonymous volumes, and unrelated Docker resources were left untouched.

The test validates this local synthetic role/schema boundary. It does not establish the security of a future Development backup procedure or remote environment.


Final-run credential handling uses inherited process environment (docker exec --env PGPASSWORD) rather than putting the password value in Docker CLI arguments. Read-only auth was verified and recorded in logs/credential-env-preflight.log; the final end-to-end run passed using that path.
