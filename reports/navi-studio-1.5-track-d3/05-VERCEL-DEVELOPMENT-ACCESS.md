# Vercel Development Access and Isolation

## Fresh read-only results

- Team `NAVI` / slug `navi01` / ID `team_Y7XqydygzWfRIbIxpgYZhwxf` is readable. Current team project listing returns only `navi-next` (`prj_rlnjagk0Uo5U0wwZosV1ot7ZKLNW`), linked to `0SEless/Navi`.
- Search `navi-dev-studio` returns zero projects. The full list returns only `navi-next`.
- `get_project` for `prj_kgc9mD5PQsO0llLIMRKlUeFZe6Hq` and for name `navi-dev-studio`, with the team ID/slug, returns `404 not_found`.
- Environment metadata for that project also returns `404 not_found`.
- Deployment listing for the candidate project returns `403 forbidden`.

These results do not establish whether the project was deleted, moved, hidden by access control, or affected by API filtering. The team scope itself is verified, but it cannot see the candidate project through these calls. Do not infer deletion or credential target. D1 had historical metadata for this candidate; it is not reproduced now. No secret values were read, and no Vercel settings changed.

## Owner dashboard procedure

1. In Vercel, select team `NAVI` (`navi01`) and search the exact ID `prj_kgc9mD5PQsO0llLIMRKlUeFZe6Hq`. Confirm whether it exists in another team/account or was removed; record the result and exact owner/team.
2. If present, inspect Git linkage, deployment source/target/branch, and Development/Preview variable scopes. Compare Supabase URL/ref securely against `scvgulusmutnzasmgysx`; do not copy secret values into chat or reports.
3. Confirm Auth callback origin/redirect allowlist and Dev-only storage credentials. Reconcile source variable names without disclosing values.
4. If the project is absent, ask the Vercel team owner to restore visibility or provide the correct Development project ID before any further isolation assessment. No project creation or configuration change is authorized by D3.
