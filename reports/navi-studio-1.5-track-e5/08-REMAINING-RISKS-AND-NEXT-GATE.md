# Remaining Risks and Next Gate

- **Current blocker:** Docker reports one running container, but `docker ps` shows no running container and `docker ps -a` shows only D2 exited. Reconcile this before creation.
- D2 data directory is a populated protected volume with PostgreSQL 17 metadata. Old fixtures may remain; they were not queried. D2 remains stopped and unchanged.
- Seven anonymous unattached volumes have unknown ownership. They are preserved.
- Host port 55432 is unused now but reserved in D2's configuration. E5 uses 55433; the E5 names and port have no current conflicts.
- The current `postgres:17-alpine` image provides PostgreSQL 17.11, so no pull is needed. The E4 runner needs a local adaptation to invoke matching tools inside the E5 container; host client packages are absent.
- Test-only `pg@8.23.1` is proposed as an exact dev dependency, but it has not been installed. No migration or real database test has run.
- Once the Docker count discrepancy is cleared, present the package in `01-PREFLIGHT-AND-APPROVAL.md` for explicit owner approval. Provision only the listed E5 names and run only the synthetic SQL scope.
