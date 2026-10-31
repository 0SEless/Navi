# Track D4 — WSL Alternative Assessment

WSL reports version 3.0.3.0, kernel 6.1.85.4-1, with Ubuntu and docker-desktop distributions both stopped (version 2). Ubuntu is the default distribution. The host reports a hypervisor present and virtualization firmware enabled.

Ubuntu was **not launched**. Starting a stopped distribution can run systemd and configured services, potentially exposing ports or resuming unrelated work. Therefore package/service/port inspection inside Ubuntu, PostgreSQL/PostGIS availability, and its workload inventory remain unknown. No packages were installed, no distribution settings changed, and no WSL shutdown/restart/reset was run.

An administrator/owner can authorize a read-only inspection window after deciding whether starting Ubuntu may resume services. Before any PostgreSQL service start or install, inventory systemd units, running processes, listening ports, installed packages, data directories, and free space. Use only synthetic test data. Do not import real NAVI/Supabase data. If inspection requires sudo or makes changes, stop and request approval.
