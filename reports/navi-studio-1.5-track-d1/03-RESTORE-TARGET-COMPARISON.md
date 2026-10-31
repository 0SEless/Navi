# Restore Target Comparison

## Current-machine finding

`supabase status` cannot inspect a local stack: Docker reports the Linux engine named pipe unavailable. `docker ps` cannot connect, and `psql` is absent. There is no existing isolated local database. Therefore **no restore target is currently usable**.

| Candidate | Fidelity | Incremental cost | Current state | Decision |
|---|---|---|---|---|
| Local PostgreSQL 17.6+ with PostGIS 3.3.7 | Good for DDL/data/FK/PostGIS smoke tests; not Supabase Auth, Storage, API, policies, or managed control plane | $0 if installed; installation/ops time | Not available: Docker daemon and `psql` missing | Preferred first target after local setup, with a separately approved restore rehearsal |
| New isolated Supabase project | Best managed Auth/PostgREST/Storage approximation | Unknown/current plan-dependent; requires a cloud resource and may incur cost | Not created; prohibited in this track | Consider only after explicit project/cost approval and isolation review |
| Existing Dev project | Exact environment but contains current Dev state | No new project charge; risk to current data | Not an acceptable restore target | Do not restore over it |
| Production project | Production data and credentials | High risk | Prohibited | Never use |

Supabase's current pricing page lists Free at $0 with at most two active free projects per organization; Free projects pause after one week of inactivity. Pro starts at $25/month, includes $10/month compute credits covering a Micro instance, and additional projects start at $10/month. A separate Free project may be $0 only if an eligible slot is available and the workload stays within quota; verify current organization/project capacity and pricing before any creation. These terms are time-sensitive and must be rechecked at approval: [Supabase pricing](https://supabase.com/pricing), [billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase).

The current Dev DB is 33 MB and has 12 FKs to `auth.users`, which makes Auth user identity mapping a restore concern. There are zero Supabase storage buckets/objects; external media is not covered. A local PG restore would not validate Auth identity, Supabase JWT/RLS integration, Edge Functions, or external provider configuration. A full-fidelity rehearsal would require a new isolated Supabase project, still with separate authorization.

No restore was run. Owner must choose target after a verified encrypted backup and confirm acceptable cost. No cloud resource was created.
