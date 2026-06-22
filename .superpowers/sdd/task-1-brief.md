### Task 1: Type Definitions (nav-types.ts)

**Files:**
- Create: `src/types/nav-types.ts`

**Interfaces:**
- Produces: `NavNode`, `NavEdge`, `Building`, `FloorInfo`, `Component` (Room/Walkway/Stair/Elevator/Entrance), `GraphSnapshot`, `PathResult`, `ValidationResult`, `Campus`

- [ ] **Step 1: Create the file**

```typescript
// src/types/nav-types.ts

export interface LatLng {
  lat: number;
  lng: number;
  elevation?: number;
}

export interface NavNode {
  id: string;
  label: string;
  position: LatLng;
  floor: number;
  buildingId: string;
  campusId: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance' | 'qr_marker';
  componentId?: string;
  metadata?: Record<string, string>;
}

export interface NavEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  weight: number;
  type: 'walkway' | 'stair' | 'elevator' | 'hallway' | 'outdoor';
  campusId: string;
}

export interface Building {
  id: string;
  name: string;
  campusId: string;
  floors: number[];
  footprint: LatLng[];
  baseElevation: number;
  height: number;
}

export interface FloorInfo {
  level: number;
  label: string;
  buildingId: string;
}

export interface MapComponent {
  id: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance';
  label: string;
  buildingId: string;
  campusId: string;
  floor: number;
  geometry: LatLng[];
  metadata?: Record<string, string>;
}

export interface GraphSnapshot {
  id: string;
  campusId: string;
  version: string;
  updatedAt: string;
  buildings: Building[];
  components: MapComponent[];
  nodes: NavNode[];
  edges: NavEdge[];
}

export interface PathResult {
  path: NavNode[];
  edges: NavEdge[];
  totalDistance: number;
  steps: PathStep[];
}

export interface PathStep {
  instruction: string;
  from: NavNode;
  to: NavNode;
  distance: number;
  type: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface Campus {
  id: string;
  name: string;
  code: string;
  center: LatLng;
  bounds: { ne: LatLng; sw: LatLng };
}
```

- [ ] **Step 2: Write and run a type-smoke test**

```typescript
// src/types/__tests__/nav-types.test.ts
import { describe, it, expect } from 'vitest';

describe('NavNode', () => {
  it('creates a valid node', () => {
    const node: import('../nav-types').NavNode = {
      id: 'n1',
      label: 'Main Gate',
      position: { lat: 11.82, lng: 122.09 },
      floor: 0,
      buildingId: 'outdoor',
      campusId: 'asu-ibajay',
      type: 'entrance',
    };
    expect(node.id).toBe('n1');
  });
});

```

Run: `npx vitest run src/types/__tests__/nav-types.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add canonical type definitions"
```

---

