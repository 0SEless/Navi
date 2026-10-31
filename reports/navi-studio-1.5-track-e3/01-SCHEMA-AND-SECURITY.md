# Proposed schema and security review

Migration: `supabase/migrations/20261030045317_navi_scoped_persistence_foundation.sql`.
Rollback proposal: `supabase/rollback/20261030045317_navi_scoped_persistence_foundation.rollback.sql`.

The new `navi_scoped` schema owns campus heads, current scope JSONB, change sets/operations/dependencies, mutation receipts, and periodic checkpoints. Composite keys bind records to campus/revision/scope identities. The forward proposal does not alter legacy public graph tables, execute a backfill, create or move PostGIS extension objects, or contain destructive statements. RLS is enabled; PUBLIC, anon, and authenticated grants are revoked where those roles exist. `service_role` grants are conditional. Keep this schema outside exposed API schemas and use only a server-side trusted authorization path. Supabase documents that service-role credentials bypass RLS and must remain server-only: [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

The rollback removes only E3-owned tables in reverse dependency order, omits `CASCADE`, and drops the schema only if empty. It requires a separately verified backup and owner approval before use. Static SQL assertions passed in the adapter test; neither file was executed against a database.

PostGIS remains untouched. Supabase documents extension placement and management separately; this design stores scoped JSONB and requires no extension change: [PostGIS extension guidance](https://supabase.com/docs/guides/database/extensions).
