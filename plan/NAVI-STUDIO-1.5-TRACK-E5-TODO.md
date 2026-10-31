# Track E5 TODO

- [x] T1. Verify backup, Git state, tools, Docker inventory, ports, disk, E4 SQL/harness safety, and Graphify context. Inventory is captured; `docker info` and `docker ps` counts conflict and must be reconciled before provisioning.
- [x] T2. Harden harness synthetic-target identification and checksum fixtures; add source-only regression coverage.
- [ ] T3. Prepare owner approval package and pause before state-changing actions. (in progress)
- [ ] T4. Provision/verify isolated PostgreSQL 17 and execute real SQL gate. (requires approval)
- [ ] T5. Run real PostgreSQL adapter integration. (requires approval)
- [ ] T6. Verify synthetic dump/restore and recovery. (requires approval)
- [ ] T7. Run regression/static checks.
- [ ] T8. Write nine reports and update progress/error/Graphify records.

Exactly one task is in progress. Docker is running, but its reported running-container count conflicts with `docker ps`. No Docker resources, database, role, or schema were created or modified in this approval phase.
