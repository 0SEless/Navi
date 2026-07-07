# 2026-06-20 — Phase 2: Backend

## Goal

Persist navigation graph data beyond page refresh using Node.js + Express + SQLite API.

## Created

- `server/package.json` — Express 5, sql.js 1.x, tsx, TypeScript 6
- `server/tsconfig.json` — ESNext modules, bundler resolution
- `server/src/index.ts` — Express app on port 3001 with CORS, JSON limit 10mb
- `server/src/types.ts` — NavNode, NavEdge, Building, Component, GraphSnapshot (mirrors frontend types)
- `server/src/sql.js.d.ts` — TypeScript declarations for sql.js
- `server/src/db/database.ts` — sql.js async init, schema (6 tables), `queryAll()` helper, file-based persistence
- `server/src/routes/graph.ts` — `GET /api/graph` (read), `POST /api/graph` (upsert all entities + snapshot)
- `server/src/routes/directory.ts` — `GET /api/directory` (building→floor→POI tree)

## Modified

- `navi-admin/src/store/graph-store.ts`:
  - Added `syncStatus` and `syncError` state
  - Added `saveToServer()` — POST graph snapshot to backend
  - Added `loadFromServer()` — GET graph from backend
  - Debaunced auto-save (2s after any mutation) via `debounceServerSave()`

## Verified

- `npx tsc --noEmit` — 0 errors (server)
- `npx tsc --noEmit` — 0 errors (client)
- `npx vite build` — 0 errors
- Integration test: POST 1 building + 1 node → GET returns same → Directory returns tree

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/graph?campus_id=asu-ibajay` | Full graph snapshot |
| POST | `/api/graph` | Save graph snapshot (upsert) |
| GET | `/api/directory?campus_id=asu-ibajay` | Building→floor→POI tree |

## Database Tables

buildings, nodes, edges, components, campuses, graph_snapshots — all scoped by campus_id.

## Running

```bash
# Server
cd navi-admin/server && npm run dev    # → http://localhost:3001

# Client (separate terminal)
cd navi-admin && npm run dev           # → http://localhost:5173
```

## Next Steps

Phase 3 — End-User App (Weeks 5-6):
- PublicMap.tsx — read-only MapLibre view
- DirectoryTree.tsx — collapsible sidebar
- RouteLine.tsx — draw A* path on map
- RoutePanel.tsx — step-by-step instructions
- Search bar filtering nodes

## Links

- [[THESIS_IMPLEMENTATION_PLAN]]
- [[NAVI System Architecture]]
- [[NAVI Database Design]]
