# Task 2.5 Report — Building + Campus API Routes

## Status: Complete

## Files Created

| File | Description |
|------|-------------|
| `navi-next/src/app/api/campuses/route.ts` | Campuses API — GET (list/single), POST (upsert), DELETE (cascade) |
| `navi-next/src/app/api/buildings/route.ts` | Buildings API — GET (list by campus_id or single by id), POST (upsert), DELETE |

## Route Details

### `GET /api/campuses`
- **No params**: Lists all campuses from `graph_snapshots`, enriched with `building_count` from `buildings` table
- **`?campus_id=xxx`**: Returns single campus with `building_count` and `node_count`

### `POST /api/campuses`
- Creates/upserts a campus via `graph_snapshots` (since there's no dedicated `campuses` table)
- Required: `campus_id`; optional: `name`, `description`, `address`

### `DELETE /api/campuses?campus_id=xxx`
- Cascading delete: route_edges → route_nodes → buildings → graph_snapshot

### `GET /api/buildings`
- **`?campus_id=xxx`** (default `asu-ibajay`): Lists all buildings for a campus
- **`?id=xxx`**: Returns single building

### `POST /api/buildings`
- Upserts a building via `buildings` table
- Required: `id`, `name`; optional: `campus_id`, `code`, `description`, `floors`, `color`, `floor_plan_url`
- PostGIS columns (`center`, `outline`) are skipped in this basic CRUD tier

### `DELETE /api/buildings?id=xxx`
- Deletes a single building by id

## Pattern Used
- `getClient(auth)` helper matches `src/app/api/graph/route.ts` — "publishable" for GET, "secret" for POST/DELETE
- `createServerClient` from `@supabase/ssr` with empty cookie handlers
- `NextResponse` for all responses

## Concerns
1. **No `campuses` table exists** — Campus data is stored via `graph_snapshots`. The campuses API works around this by reading from `graph_snapshots` and aggregating counts from related tables.
2. **PostGIS columns excluded from buildings POST** — The `center` (GEOGRAPHY POINT) and `outline` (GEOGRAPHY POLYGON) fields aren't handled in basic upsert. A follow-up should add a dedicated RPC for spatial insert/update.
3. **No authentication middleware** — Follows existing pattern where any client with the anon key can read. No RLS or user auth enforced.
