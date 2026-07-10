# Architecture Specification: Compiler Pipeline

**Document**: 10-compiler-pipeline.md
**Status**: Draft
**Date**: 2026-07-09

---

## Purpose

Define the compiler pipeline for NAVI Studio — the process that transforms a CampusDocument into a NavigationGraph. The compiler is a pure function that reads the document and produces navigable artifacts. It has no UI dependencies and can run in a worker or server context.

---

## Goals

1. Define the compilation pipeline stages (parse, build, connect, optimize, validate).
2. Specify the NavigationGraph output format.
3. Define how entities map to graph nodes and edges.
4. Specify connectivity analysis (are all spaces connected?).
5. Ensure compiler is testable, deterministic, and performant.

---

## Design Principles

1. **Pure Function** — Compiler(CampusDocument) → NavigationGraph. No side effects. No state.
2. **Invisible to Users** — Nodes and edges are artifacts. Users never see graph terminology.
3. **Deterministic** — Same document always produces same graph. No randomness.
4. **Fault-Tolerant** — Invalid entities produce warnings but don't crash the compiler. Maximal valid output.

---

## Pipeline Architecture

### Core Stages

```
CampusDocument
       │
       ▼
  ┌──────────────┐
  │  1. Parse     │  Validate document structure, extract entities
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │  2. Build     │  Create graph nodes from rooms, hallways, entrances, etc.
  │     Nodes     │  Each entity → one or more GraphNodes
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │  3. Build     │  Connect nodes based on entity relationships
  │     Edges     │  Room↔Hallway, Hallway↔Entrance, Stair↔Floor, etc.
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │  4. Connect   │  Cross-building connections, entrance-to-road
  │     Campuses  │  Outdoor path connectivity
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │  5. Optimize  │  Remove redundant nodes, short-circuit dead ends
  └──────┬───────┘
         ▼
  ┌──────────────┐
  │  6. Validate  │  Check connectivity, report orphaned nodes
  └──────┬───────┘
         ▼
   NavigationGraph
```

### Stage Plugin Interface

Each stage in the pipeline is replaceable via a `CompilerStagePlugin` interface. This allows third-party extensions to customize compilation logic without modifying the core compiler.

```typescript
interface CompilerStagePlugin {
  /** Plugin identifier (must be namespaced: "compiler-{name}") */
  id: string;

  /** Which stage this plugin replaces or augments */
  targetStage: 'parse' | 'build-nodes' | 'build-edges' | 'connect-campuses' | 'optimize' | 'validate';

  /** Plugin metadata */
  meta: {
    name: string;
    version: string;
    description: string;
    author?: string;
  };

  /** Execution mode */
  mode: 'replace' | 'augment';

  /** Execute the plugin (replaces or wraps the default stage) */
  execute(input: CompilerStageInput, next: CompilerStageNext): CompilerStageOutput;
}

interface CompilerStageInput {
  /** The document being compiled (available at all stages) */
  document: CampusDocument;

  /** Parsed document (available after parse stage) */
  parsed?: ParsedDocument;

  /** Current graph state (available after build-nodes stage) */
  nodes?: GraphNode[];
  edges?: GraphEdge[];

  /** Stage-specific context */
  context: Record<string, unknown>;
}

interface CompilerStageOutput {
  /** Modified nodes (if stage operates on nodes) */
  nodes?: GraphNode[];

  /** Modified edges (if stage operates on edges) */
  edges?: GraphEdge[];

  /** Warnings to add to result */
  warnings?: CompileWarning[];

  /** Errors (returning errors halts the pipeline) */
  errors?: CompileError[];

  /** Pass-through data for later stages */
  context?: Record<string, unknown>;
}

type CompilerStageNext = (input: CompilerStageInput) => CompilerStageOutput;
```

### Plugin Registration

```typescript
interface CompilerConfig {
  /** Built-in stage implementations (default: use internal implementations) */
  stages?: {
    parse?: new () => CompilerStagePlugin;
    'build-nodes'?: new () => CompilerStagePlugin;
    'build-edges'?: new () => CompilerStagePlugin;
    'connect-campuses'?: new () => CompilerStagePlugin;
    'optimize'?: new () => CompilerStagePlugin;
    'validate'?: new () => CompilerStagePlugin;
  };

  /** Third-party plugins */
  plugins?: CompilerStagePlugin[];
}

class CampusCompiler implements Compiler {
  constructor(private config: CompilerConfig = {}) {
    this.registerPlugins(config.plugins || []);
  }

  private registerPlugins(plugins: CompilerStagePlugin[]): void {
    for (const plugin of plugins) {
      // Validate plugin ID convention
      if (!plugin.id.startsWith('compiler-')) {
        throw new Error(`Plugin ID must start with "compiler-": ${plugin.id}`);
      }
      // Store in stage plugin registry
      this.stagePlugins.get(plugin.targetStage)?.push(plugin);
    }
  }

  private executeStage(
    stage: string,
    input: CompilerStageInput,
    defaultImpl: () => CompilerStageOutput
  ): CompilerStageOutput {
    const plugins = this.stagePlugins.get(stage) || [];

    if (plugins.length === 0) {
      // No plugins → use default implementation
      return defaultImpl();
    }

    // Chain plugins: first 'replace' plugin wins, 'augment' plugins wrap
    const replacePlugin = plugins.find(p => p.mode === 'replace');
    const augmentPlugins = plugins.filter(p => p.mode === 'augment');

    if (replacePlugin) {
      // Replace mode: plugin takes full control, receives next as fallback
      return replacePlugin.execute(input, () => defaultImpl());
    }

    // Augment mode: chain plugins around default
    let chain = defaultImpl;
    for (const plugin of augmentPlugins.reverse()) {
      const next = chain;
      chain = () => plugin.execute(input, next);
    }
    return chain();
  }
}
```

### Plugin Examples

```typescript
// ─── Custom Edge Weight Plugin ────────────────────────────
// Augments the build-edges stage to add custom edge weights
// based on accessibility preferences

const accessibilityWeightPlugin: CompilerStagePlugin = {
  id: 'compiler-accessibility-weights',
  targetStage: 'build-edges',
  meta: {
    name: 'Accessibility Weight Plugin',
    version: '1.0.0',
    description: 'Adjusts edge weights for wheelchair accessibility',
  },
  mode: 'augment',
  execute(input, next) {
    const result = next(input);

    // Adjust weights: make non-accessible edges slightly longer
    // (pathfinding will prefer accessible routes)
    if (result.edges) {
      for (const edge of result.edges) {
        if (!edge.properties.isAccessible) {
          edge.weight *= 1.5; // 50% penalty for non-accessible routes
        }
      }
    }

    return result;
  },
};

// ─── Custom Validation Plugin ─────────────────────────────
// Replaces the validate stage with a custom validator

const customValidationPlugin: CompilerStagePlugin = {
  id: 'compiler-custom-validator',
  targetStage: 'validate',
  meta: {
    name: 'Custom Campus Validator',
    version: '2.0.0',
    description: 'Custom validation rules for university-specific requirements',
  },
  mode: 'replace',
  execute(input, _next) {
    // Custom validation logic (doesn't call default)
    return {
      warnings: [],
      errors: [],
    };
  },
};
```

---

---

## Compiler Interface

```typescript
interface Compiler {
  /** Compile a CampusDocument into a NavigationGraph */
  compile(document: CampusDocument): CompileResult;

  /** Compile with progress callbacks (for UI progress display) */
  compileWithProgress(
    document: CampusDocument,
    onProgress: (stage: CompileStage, progress: number) => void
  ): CompileResult;
}

interface CompileResult {
  success: boolean;
  graph: NavigationGraph | null;
  stats: CompileStats;
  warnings: CompileWarning[];
  errors: CompileError[];
  duration: number; // ms
}

interface CompileStage {
  name: string;     // "Building nodes", "Connecting edges", etc.
  progress: number;  // 0–1
}

interface CompileStats {
  totalNodes: number;
  totalEdges: number;
  buildingsProcessed: number;
  floorsProcessed: number;
  roomsProcessed: number;
  hallwaysProcessed: number;
  totalRouteLength: number; // meters
  connectivityScore: number; // 0–1 (percentage of connected nodes)
}

interface CompileWarning {
  code: string;     // 'ORPHANED_ROOM'
  message: string;  // "Room 203 has no hallway connection"
  entityId: string;
}

interface CompileError {
  code: string;
  message: string;
  entityId?: string;
}
```

---

## NavigationGraph (Compiled Artifact)

The NavigationGraph is the second tier in the three-model architecture (see [01 CampusDocument Model](01-campus-document-model.md#three-model-separation)):

```
CampusDocument (authoring)  →  NavigationGraph (compiled)  →  NavigationSession (runtime)
       Studio                        Compiler                      Navigation App
    editable JSON               read-only graph                 in-memory session
```

The NavigationSession is not produced by the compiler; it is created at app startup by loading a NavigationGraph into the runtime.

```typescript
interface NavigationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    compiledAt: string;
    compilerVersion: string;
    documentVersion: string;
    campusCenter: Coordinate;
    bounds: Bounds;
  };
}

interface GraphNode {
  id: string;                    // unique node ID
  entityId: string;              // source entity ID
  entityType: EntityType;        // source entity type
  label: string;                 // display name
  position: Coordinate;          // geographic position
  floorId?: string;              // floor this node belongs to
  floorLevel?: number;           // floor level number
  buildingId?: string;           // building this node belongs to
  properties: {
    isEntrance: boolean;         // can enter/exit building
    isElevation: boolean;        // connects floors (stair/elevator)
    isAccessible: boolean;       // wheelchair accessible
    category?: string;           // room category, POI category
  };
  connections: string[];         // neighbor node IDs
}

interface GraphEdge {
  id: string;
  sourceId: string;              // node ID
  targetId: string;              // node ID
  weight: number;                // distance in meters
  edgeType: EdgeType;
  properties: {
    isAccessible: boolean;
    isElevation: boolean;
    floorChange?: boolean;       // crossing floor boundary
    buildingChange?: boolean;    // crossing building boundary
  };
}

type EdgeType =
  | 'room_to_hallway'     // Room door → hallway
  | 'hallway_to_hallway'  // Hallway intersection
  | 'hallway_to_entrance' // Hallway → building entrance
  | 'entrance_to_outdoor' // Building entrance → outdoor path
  | 'stair_connection'    // Stair between floors
  | 'elevator_connection' // Elevator between floors
  | 'outdoor_path'        // Path/road between buildings
  | 'walkable_area';      // Open area (future)
```

---

## Pipeline Stages

### Stage 1: Parse

```typescript
class ParseStage {
  parse(document: CampusDocument): ParsedDocument {
    // 1. Validate document structure
    // 2. Extract all entities by type
    // 3. Build spatial index (for proximity queries)
    // 4. Return parsed representation
    return {
      campus: document.campus,
      buildings: Object.values(document.entities.buildings),
      floors: Object.values(document.entities.floors),
      rooms: Object.values(document.entities.rooms),
      hallways: Object.values(document.entities.hallways),
      entrances: Object.values(document.entities.entrances),
      stairs: Object.values(document.entities.stairs),
      elevators: Object.values(document.entities.elevators),
      roads: Object.values(document.entities.roads),
      paths: Object.values(document.entities.paths),
      parking: Object.values(document.entities.parking),
      pois: Object.values(document.entities.pois),
      spatialIndex: new SpatialIndex(document),
    };
  }
}
```

### Stage 2: Build Nodes

```typescript
class NodeBuilder {
  build(parsed: ParsedDocument): GraphNode[] {
    const nodes: GraphNode[] = [];

    // Rooms → nodes (one per room, positioned at room center or entrance point)
    for (const room of parsed.rooms) {
      const center = polygonCenter(room.polygon);
      nodes.push({
        id: `node-room-${room.id}`,
        entityId: room.id,
        entityType: 'room',
        label: room.name || room.number || `Room ${room.id}`,
        position: room.entrancePoints[0] || center,
        floorId: room.floorId,
        floorLevel: getFloorLevel(parsed, room.floorId),
        buildingId: getBuildingId(parsed, room.floorId),
        properties: {
          isEntrance: false,
          isElevation: false,
          isAccessible: true,
          category: room.category,
        },
        connections: [],
      });
    }

    // Hallways → nodes (one per hallway midpoint + one per intersection)
    for (const hallway of parsed.hallways) {
      const midpoints = getHallwayMidpoints(hallway);
      for (let i = 0; i < midpoints.length; i++) {
        nodes.push({
          id: `node-hallway-${hallway.id}-${i}`,
          entityId: hallway.id,
          entityType: 'hallway',
          label: hallway.name,
          position: midpoints[i],
          floorId: hallway.floorId,
          floorLevel: getFloorLevel(parsed, hallway.floorId),
          buildingId: getBuildingId(parsed, hallway.floorId),
          properties: {
            isEntrance: false,
            isElevation: false,
            isAccessible: true,
          },
          connections: [],
        });
      }
    }

    // Entrances → nodes (building access points)
    for (const entrance of parsed.entrances) {
      nodes.push({
        id: `node-entrance-${entrance.id}`,
        entityId: entrance.id,
        entityType: 'entrance',
        label: entrance.name || 'Entrance',
        position: entrance.position,
        floorId: entrance.floorId,
        floorLevel: entrance.floorId ? getFloorLevel(parsed, entrance.floorId) : 0,
        buildingId: entrance.buildingId,
        properties: {
          isEntrance: true,
          isElevation: false,
          isAccessible: entrance.isAccessible,
        },
        connections: [],
      });
    }

    // Stairs → nodes (one per floor pair)
    for (const stair of parsed.stairs) {
      for (const floorId of stair.floorIds) {
        if (stair.floorIds.indexOf(floorId) < stair.floorIds.length - 1) {
          nodes.push({
            id: `node-stair-${stair.id}-${floorId}`,
            entityId: stair.id,
            entityType: 'stair',
            label: stair.name || 'Stairs',
            position: stair.position,
            floorId: floorId,
            floorLevel: getFloorLevel(parsed, floorId),
            buildingId: stair.buildingId,
            properties: {
              isEntrance: false,
              isElevation: true,
              isAccessible: stair.isAccessible,
            },
            connections: [],
          });
        }
      }
    }

    // Elevators → nodes (one per floor)
    for (const elevator of parsed.elevators) {
      for (const floorId of elevator.floorIds) {
        nodes.push({
          id: `node-elevator-${elevator.id}-${floorId}`,
          entityId: elevator.id,
          entityType: 'elevator',
          label: elevator.name || 'Elevator',
          position: elevator.position,
          floorId: floorId,
          floorLevel: getFloorLevel(parsed, floorId),
          buildingId: elevator.buildingId,
          properties: {
            isEntrance: false,
            isElevation: true,
            isAccessible: true,
          },
          connections: [],
        });
      }
    }

    // POIs, QR checkpoints, panoramas → nodes
    // ... similar patterns

    return nodes;
  }
}
```

### Stage 3: Build Edges

```typescript
class EdgeBuilder {
  build(nodes: GraphNode[], parsed: ParsedDocument): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Room → Hallway (from room.hallwayIds)
    for (const room of parsed.rooms) {
      const roomNode = nodes.find(n => n.entityId === room.id);
      if (!roomNode) continue;
      for (const hallwayId of room.hallwayIds) {
        const hallwayNodes = nodes.filter(n => n.entityId === hallwayId);
        for (const hwNode of hallwayNodes) {
          edges.push({
            id: `edge-room-hallway-${room.id}-${hwNode.id}`,
            sourceId: roomNode.id,
            targetId: hwNode.id,
            weight: haversineDistance(roomNode.position, hwNode.position),
            edgeType: 'room_to_hallway',
            properties: { isAccessible: true, isElevation: false },
          });
        }
      }
    }

    // Hallway segment connections (connect sequential hallway nodes)
    // Entrance → Hallway (from entrance.connectedHallwayId)
    // Entrance → Outdoor (connect entrance to nearest path/road)
    // Stair connections (connect stair nodes on adjacent floors)
    // Elevator connections (connect elevator nodes on adjacent floors)

    return edges;
  }
}
```

### Stage 4: Connect Campuses

```typescript
class CampusConnector {
  connect(nodes: GraphNode[], edges: GraphEdge[], parsed: ParsedDocument): void {
    // Connect building entrances to outdoor paths
    // Connect paths to roads
    // Create outdoor walking routes between buildings
    // Connect parking areas to nearest paths
  }
}
```

### Stage 5: Optimize

```typescript
class GraphOptimizer {
  optimize(graph: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    // Remove nodes with no connections (dead ends)
    // Merge redundant nodes (e.g., two nodes at same position)
    // Short-circuit: if A↔B and B↔C and A↔C, keep only necessary edges
    // Ensure graph is connected (if not, flag warnings)
  }
}
```

### Stage 6: Validate

```typescript
class CompileValidator {
  validate(graph: NavigationGraph, parsed: ParsedDocument): CompileResult {
    const warnings: CompileWarning[] = [];

    // Check for orphaned rooms (room with no hallway connection)
    for (const room of parsed.rooms) {
      const roomNodes = graph.nodes.filter(n => n.entityId === room.id);
      const hasConnections = roomNodes.some(n => n.connections.length > 0);
      if (!hasConnections) {
        warnings.push({
          code: 'ORPHANED_ROOM',
          message: `"${room.name || room.number}" has no hallway connection`,
          entityId: room.id,
        });
      }
    }

    // Check for disconnected buildings
    // Check for floors with no nodes
    // Check connectivity score

    return {
      success: true,
      graph,
      stats: calculateStats(graph, parsed),
      warnings,
      errors: [],
      duration: 0,
    };
  }
}
```

---

## Compiler Usage

```typescript
// Main compiler class
class CampusCompiler implements Compiler {
  constructor() {}

  compile(document: CampusDocument): CompileResult {
    const startTime = performance.now();

    try {
      // Stage 1: Parse
      const parsed = new ParseStage().parse(document);

      // Stage 2: Build Nodes
      const nodes = new NodeBuilder().build(parsed);

      // Stage 3: Build Edges
      const edges = new EdgeBuilder().build(nodes, parsed);

      // Stage 4: Connect Campuses
      new CampusConnector().connect(nodes, edges, parsed);

      // Stage 5: Optimize
      const graph = { nodes, edges };
      new GraphOptimizer().optimize(graph);

      // Stage 6: Validate
      const navigationGraph: NavigationGraph = {
        nodes: graph.nodes,
        edges: graph.edges,
        metadata: {
          compiledAt: new Date().toISOString(),
          compilerVersion: '1.0.0',
          documentVersion: document.schemaVersion,
          campusCenter: document.campus.center,
          bounds: calculateBounds(graph.nodes),
        },
      };

      const result = new CompileValidator().validate(navigationGraph, parsed);
      result.duration = performance.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        graph: null,
        stats: emptyStats(),
        warnings: [],
        errors: [{ code: 'COMPILE_ERROR', message: (error as Error).message }],
        duration: performance.now() - startTime,
      };
    }
  }
}
```

---

## Web Worker Integration

```typescript
// Compiler worker (runs off main thread)
self.onmessage = (event: MessageEvent<CampusDocument>) => {
  const compiler = new CampusCompiler();
  const result = compiler.compile(event.data);
  self.postMessage(result);
};

// Main thread usage
function compileInWorker(document: CampusDocument): Promise<CompileResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('compiler.worker.js');
    worker.onmessage = (event) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = reject;
    worker.postMessage(document);
  });
}
```

---

## Performance Targets

| Campus Size | Nodes | Edges | Compile Time |
|-------------|-------|-------|-------------|
| Small (1 building, 3 floors, 10 rooms) | ~50 | ~100 | < 100ms |
| Medium (10 buildings, 30 floors, 200 rooms) | ~500 | ~1500 | < 500ms |
| Large (50 buildings, 200 floors, 2000 rooms) | ~5000 | ~20000 | < 3s |
| X-Large (200 buildings, 1000 floors, 10000 rooms) | ~25000 | ~100000 | < 10s |

---

## Relationship to Other Documents

| Document | Connection |
|----------|-----------|
| [08 Publishing Specification](../product/08-publishing-specification.md) | Compile Preview, Navigation Overlay |
| [01 CampusDocument Model](01-campus-document-model.md) | Source data structure, CompileOutput |
| [00 Package Architecture](00-package-architecture.md) | Compiler in `@navi/compiler`, no UI deps |
| [11 Publishing Pipeline](11-publishing-pipeline.md) | Compiler output consumed by publisher |
