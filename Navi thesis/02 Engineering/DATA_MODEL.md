# NAVI Data Model

## Core Entities

### GraphSnapshot

The compiled output of the editor, stored as a single JSONB document in Supabase.

```json
{
  "campusId": "asu-ibajay",
  "version": "1.0.0",
  "updatedAt": "2026-06-22T10:00:00Z",
  "buildings": [
    { "id": "sit-bldg", "name": "SIT Building", "floors": [1, 2] }
  ],
  "components": [
    { "id": "rm-101", "type": "Room", "label": "IT Office",
      "polygon": [[20,50], [140,50], [140,130], [20,130]] }
  ],
  "graph": {
    "nodes": [
      { "id": "n1", "label": "IT Office", "x": 80, "y": 130, "floor": 1 }
    ],
    "edges": [
      { "from": "n1", "to": "n2", "distance": 50 }
    ]
  }
}
```

### NavNode

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `label` | string | Human-readable name |
| `x`, `y` | number | Cartesian coordinates |
| `floor` | number | Floor level (0=GF, 1=1F, etc.) |
| `buildingId` | string | Parent building |
| `componentId` | string | Source component |

### NavEdge

| Field | Type | Description |
|-------|------|-------------|
| `from` | string | Source node ID |
| `to` | string | Target node ID |
| `distance` | number | Weight in meters |
| `type` | enum | `walkway`, `stair`, `elevator`, `hallway` |

### Component

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `type` | enum | `Room`, `Stair`, `Elevator`, `Hallway`, `Entrance`, `Restroom` |
| `label` | string | Display name |
| `polygon` | array | Shape geometry coordinates |

## Supabase Schema

### Tables

- `campuses` — Multi-tenant campus records
- `buildings` — Building metadata with GEOGRAPHY column
- `route_nodes` — Compiled nodes with GEOGRAPHY point
- `route_edges` — Compiled edges with FK references
- `graph_snapshots` — JSONB snapshot cache (primary read source)
- `components` — Editor component registry
