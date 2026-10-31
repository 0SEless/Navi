# PostgreSQL Integrity Evidence

## Target and isolation

Final run used local synthetic E5 only: PostgreSQL 17.0.11 (`server_version_num=170011`), database `navi_e4_test`, restricted runner `navi_e4_runner`, marker `navi-e4-synthetic-v1`. Read-only preflight recorded Docker Engine 29.8.1 / `desktop-linux`, container `navi-e5-postgres17`, image digest `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`, dedicated network `navi-e5-postgres17-net`, named volume `navi-e5-postgres17-data`, and localhost-only port `127.0.0.1:55433`. No D2 resources were inspected or changed by the E8.5 runner.

Preflight JSON: `logs/run-bb67734817d44c04a63c70ded059abd0/e5-readonly-preflight.json`.

## Database results

| Check | Result |
|---|---|
| E5 authored campus revision | 2 |
| Terrain scope revision | 2 |
| Published bundle revision | 2 (separate from authored revision) |
| Change sets / operations / mutation receipts | 2 / 2 / 2 |
| Changed scope | `terrain:<campusId>` only, revisions 1 then 2 |
| Building scope | `e8-building-library`, revision 0 |
| Campus settings | revision 0 |
| Campus routing | revision 0 |
| Building routing | revision 0 |
| Reconstructed checksum | `23c6e58f72280971eb67b29d681ef31ca294a6fb3ef91f16dfa9f09221460bb1` |

The five scope-head checksums and row counts appear in the `E8_5_STUDIO_E5_COMPILER_RUNTIME_EVIDENCE` record in the final Playwright log. Terrain scope checksum at revision 2 is `cb67d8a8e4c54666d79da49612536a992163620a9ac845336888c8c60eb10b7b`. Building/settings/routing heads remained at revision 0. The test independently reconstructed the revision from PostgreSQL before compile and again queried heads, counts and reconstruction at closeout.

This proves the synthetic E5 workflow only; it says nothing about the recoverability of a real Development or Production database.
