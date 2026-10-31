# Proposed schema security review

The E3 additive proposal now includes batch identity in `navi_scoped.change_sets` and `navi_scoped.mutation_receipts`, with a composite foreign key from each receipt to the exact campus/revision/batch. It retains the composite campus/scope and campus/revision foreign keys, uniqueness constraints, indexes, and seven RLS-enabled application-owned tables.

The schema comment states that the migration executor owns the schema and must be a server-side migration role; ownership must not be transferred to `anon` or `authenticated`. Keep `navi_scoped` outside Supabase exposed API schemas. PUBLIC privileges are revoked; anon/authenticated schema/table/default-table privileges are conditionally revoked; no client policies or grants are created. A conditional service-role grant exists only for standalone source compatibility; Supabase service-role credentials bypass RLS and must stay server-only ([Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)).

All scoped payloads remain application-owned JSONB. No PostGIS extension-owned table, extension, or schema is modified. The explicit rollback drops only E3-owned tables in reverse dependency order, omits `CASCADE`, and drops the schema only when empty.

Static migration/rollback tests passed. The ownership assumption, role grants, RLS behavior, foreign keys, and rollback have not been validated by PostgreSQL. The migration proposal is not applied to Development or Production.
