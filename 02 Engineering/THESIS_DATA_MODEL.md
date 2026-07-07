# NAVI Data Model — Unified Types

## Canonical Types (Single Source)

```typescript
// ===== Position =====

interface LatLng {
  lat: number
  lng: number
}

// ===== Node Types =====

type NodeType =
  | 'building_entrance'
  | 'intersection'
  | 'staircase'
  | 'elevator'
  | 'room'
  | 'outdoor'
  | 'corner'        // building boundary (non-navigable)
  | 'waypoint'      // intermediate path point

type EdgeType =
  | 'walkway'
  | 'stairs'
  | 'corridor'
  | 'elevator'
  | 'ramp'
  | 'wall'          // building perimeter (non-navigable)

type ComponentType =
  | 'room'
  | 'stair'
  | 'elevator'
  | 'hallway'
  | 'entrance'
  | 'restroom'

// ===== Graph Elements =====

interface NavNode {
  id: string
  name: string
  type: NodeType
  campusId?: string
  buildingId?: string
  floor: number
  position: LatLng
  svgOffset?: { x: number; y: number }
  hasQr?: boolean
  hasPanorama?: boolean
  metadata?: Record<string, unknown>
}

interface NavEdge {
  id: string
  from: string
  to: string
  type: EdgeType
  distance: number
  metadata?: {
    travelType?: string
    isBidirectional?: boolean
  }
}

interface Building {
  id: string
  campusId?: string
  name: string
  description: string
  latitude: number
  longitude: number
  image: string | null
  createdAt: string
}

// ===== Component =====

interface Component {
  id: string
  type: ComponentType
  name: string
  buildingId: string
  floor: number
  position: LatLng
  dimensions?: {
    width: number
    height: number
    rotation?: number
  }
  connections?: string[]
  metadata?: Record<string, unknown>
}

// ===== Graph =====

interface GraphSnapshot {
  version: string
  campusId: string
  buildings: Building[]
  nodes: NavNode[]
  edges: NavEdge[]
  exportedAt: string
}

// ===== Directory =====

interface DirEntry {
  id: string
  label: string
  type: 'building' | 'floor' | 'room' | 'entrance' | 'facility'
  nodeId?: string
  children?: DirEntry[]
}

// ===== Pathfinding =====

interface PathResult {
  path: string[]
  cost: number
  steps: PathStep[]
}

interface PathStep {
  nodeId: string
  instruction: string
  distance: number
}

// ===== Validation =====

interface ValidationResult {
  category: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  affectedIds?: string[]
}
```

## Type System Migration

| Current File | Current Types | Action |
|-------------|---------------|--------|
| `types/route.ts` | `RouteNode`, `RouteEdge` | Delete — merge into nav-types.ts |
| `map-editor/types.ts` | `NavNode`, `NavEdge`, `CampusBuilding` | Keep — extend canonical types |
| `types/building.ts` | `Building`, `Floor`, `Room` | Keep — already clean |
| `types/campus.ts` | `Campus`, `CampusMapSettings` | Keep — already clean |
| `types/user.ts` | `User`, `AuthState` | Keep — unrelated |
| **NEW** `types/nav-types.ts` | All canonical types | Create |

## Key Rules

1. `NavNode` is the single node type used everywhere — no more `RouteNode` vs `NavNode`
2. All positions stored as lat/lng, never x/y pixels (SVG views convert at render time)
3. Distances in meters, calculated via Haversine formula
4. Components are source of truth; compiled graph is derived (re-compilable)
5. Graph mutations cascade: remove node → remove connected edges automatically

## Links

- [[THESIS_ARCHITECTURE]]
- [[THESIS_DEFINITION]]
- [[NAVI Database Design]] (original PostGIS schema)
