import type {
  NavNode, NavEdge, Building, Component, LatLng, TracePath,
  GraphSnapshot, PathResult, ValidationResult, DirEntry,
} from '../types/nav-types'
import { aStar, getAdjacencyList } from './a-star'
import { haversine } from './geo-utils'
import { validateGraph } from './graph-validator'
import { buildDirectory } from './directory'
import { compileTrace } from './trace-compiler'
import { lineSegmentIntersection, closestPointOnSegment, pointToSegmentDistance } from './geo-utils'
import { genId } from './component-compiler'

export class Graph {
  campusId: string = 'asu-ibajay'
  private _nodes: Map<string, NavNode> = new Map()
  private _edges: Map<string, NavEdge> = new Map()
  private _buildings: Map<string, Building> = new Map()
  private _components: Map<string, Component> = new Map()
  private _traces: Map<string, TracePath> = new Map()
  private _cachedNodes: NavNode[] | null = null
  private _cachedEdges: NavEdge[] | null = null
  private _cachedBuildings: Building[] | null = null
  private _cachedComponents: Component[] | null = null
  private _cachedTraces: TracePath[] | null = null

  // ---- Accessors ----

  get nodes(): NavNode[] {
    if (!this._cachedNodes) this._cachedNodes = Array.from(this._nodes.values())
    return this._cachedNodes
  }

  get edges(): NavEdge[] {
    if (!this._cachedEdges) this._cachedEdges = Array.from(this._edges.values())
    return this._cachedEdges
  }

  get buildings(): Building[] {
    if (!this._cachedBuildings) this._cachedBuildings = Array.from(this._buildings.values())
    return this._cachedBuildings
  }

  get components(): Component[] {
    if (!this._cachedComponents) this._cachedComponents = Array.from(this._components.values())
    return this._cachedComponents
  }

  get traces(): TracePath[] {
    if (!this._cachedTraces) this._cachedTraces = Array.from(this._traces.values())
    return this._cachedTraces
  }

  get buildingCount(): number { return this._buildings.size }
  get nodeCount(): number { return this._nodes.size }
  get edgeCount(): number { return this._edges.size }
  get componentCount(): number { return this._components.size }

  getNode(id: string): NavNode | undefined {
    return this._nodes.get(id)
  }

  getEdge(id: string): NavEdge | undefined {
    return this._edges.get(id)
  }

  getBuilding(id: string): Building | undefined {
    return this._buildings.get(id)
  }

  getComponent(id: string): Component | undefined {
    return this._components.get(id)
  }

  // ---- Mutations ----

  addNode(node: NavNode): void {
    this._nodes.set(node.id, node)
    this._cachedNodes = null
  }

  addEdge(edge: NavEdge): void {
    this._edges.set(edge.id, edge)
    this._cachedEdges = null
  }

  removeNode(id: string): void {
    this._nodes.delete(id)
    for (const [eid, edge] of this._edges) {
      if (edge.from === id || edge.to === id) {
        this._edges.delete(eid)
      }
    }
    this._cachedNodes = null
    this._cachedEdges = null
  }

  removeEdge(id: string): void {
    this._edges.delete(id)
    this._cachedEdges = null
  }

  updateNode(id: string, partial: Partial<NavNode>): void {
    const existing = this._nodes.get(id)
    if (existing) {
      this._nodes.set(id, { ...existing, ...partial })
      this._cachedNodes = null
    }
  }

  updateEdge(id: string, partial: Partial<NavEdge>): void {
    const existing = this._edges.get(id)
    if (existing) {
      this._edges.set(id, { ...existing, ...partial })
      this._cachedEdges = null
    }
  }

  addBuilding(building: Building): void {
    this._buildings.set(building.id, building)
    this._cachedBuildings = null
  }

  updateBuilding(id: string, partial: Partial<Building>): void {
    const existing = this._buildings.get(id)
    if (existing) {
      this._buildings.set(id, { ...existing, ...partial })
      this._cachedBuildings = null
    }
  }

  removeBuilding(id: string): void {
    this._buildings.delete(id)
    for (const node of this.nodes) {
      if (node.buildingId === id) {
        this._nodes.delete(node.id)
      }
    }
    for (const [eid, edge] of this._edges) {
      if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
        this._edges.delete(eid)
      }
    }
    this._cachedBuildings = null
    this._cachedNodes = null
    this._cachedEdges = null
  }

  // ---- Component Operations ----

  addComponent(component: Component): void {
    this._components.set(component.id, component)
    this._cachedComponents = null
  }

  updateComponent(id: string, partial: Partial<Component>): void {
    const existing = this._components.get(id)
    if (existing) {
      this._components.set(id, { ...existing, ...partial })
      this._cachedComponents = null
    }
  }

  removeComponent(id: string): void {
    this._components.delete(id)
    for (const node of this.nodes) {
      if (node.componentId === id) {
        this._nodes.delete(node.id)
      }
    }
    for (const [eid, edge] of this._edges) {
      if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
        this._edges.delete(eid)
      }
    }
    this._cachedComponents = null
    this._cachedNodes = null
    this._cachedEdges = null
  }

  getNodesByComponent(componentId: string): NavNode[] {
    return this.nodes.filter((n) => n.componentId === componentId)
  }

  // ---- Trace Operations ----

  getTrace(id: string): TracePath | undefined {
    return this._traces.get(id)
  }

  addTrace(trace: TracePath): void {
    this._traces.set(trace.id, trace)
    this._cachedTraces = null
  }

  updateTrace(id: string, partial: Partial<TracePath>): void {
    const existing = this._traces.get(id)
    if (existing) {
      this._traces.set(id, { ...existing, ...partial })
      this._cachedTraces = null
    }
  }

  removeTrace(id: string): void {
    this._traces.delete(id)
    for (const node of this.nodes) {
      if (node.metadata?.traceId === id) {
        this._nodes.delete(node.id)
      }
    }
    for (const [eid, edge] of this._edges) {
      if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
        this._edges.delete(eid)
      }
    }
    this._cachedTraces = null
    this._cachedNodes = null
    this._cachedEdges = null
  }

  addTraceWithCompile(
    trace: TracePath,
    roomNodes: NavNode[]
  ): void {
    const existingTraces = this.traces
    const result = compileTrace(
      trace,
      existingTraces,
      this.nodes,
      this.edges,
      roomNodes
    )
    this.addTrace(trace)
    for (const node of result.nodes) {
      node.metadata = { ...node.metadata, traceId: trace.id }
      this.addNode(node)
    }
    for (const edge of result.edges) {
      this.addEdge(edge)
    }
  }

  setTraces(traces: TracePath[]): void {
    this._traces.clear()
    for (const t of traces) this._traces.set(t.id, t)
    this._cachedTraces = null
  }

  // ---- Bulk Operations ----

  setNodes(nodes: NavNode[]): void {
    this._nodes.clear()
    for (const n of nodes) this._nodes.set(n.id, n)
    this._cachedNodes = null
  }

  setEdges(edges: NavEdge[]): void {
    this._edges.clear()
    for (const e of edges) this._edges.set(e.id, e)
    this._cachedEdges = null
  }

  setBuildings(buildings: Building[]): void {
    this._buildings.clear()
    for (const b of buildings) this._buildings.set(b.id, b)
    this._cachedBuildings = null
  }

  setComponents(components: Component[]): void {
    this._components.clear()
    for (const c of components) this._components.set(c.id, c)
    this._cachedComponents = null
  }

  // ---- Queries ----

  findPath(fromId: string, toId: string): PathResult | null {
    return aStar(this.nodes, this.edges, fromId, toId, {
      buildings: this.buildings,
      components: this.components,
    })
  }

  getNodesByBuilding(buildingId: string): NavNode[] {
    return this.nodes.filter((n) => n.buildingId === buildingId)
  }

  getNodesByFloor(buildingId: string, floor: number): NavNode[] {
    return this.nodes.filter((n) => n.buildingId === buildingId && n.floor === floor)
  }

  getEdgesForNode(nodeId: string): NavEdge[] {
    return this.edges.filter((e) => e.from === nodeId || e.to === nodeId)
  }

  getNearestNode(position: LatLng, maxDistance = 50): NavNode | null {
    let nearest: NavNode | null = null
    let minDist = maxDistance
    for (const node of this.nodes) {
      const d = haversine(position, node.position)
      if (d < minDist) {
        minDist = d
        nearest = node
      }
    }
    return nearest
  }

  syncHallwayIntersections(buildingId: string, floor: number): void {
    const hallways = this.components.filter(
      c => c.type === 'hallway' && c.buildingId === buildingId && c.floor === floor
    )
    if (hallways.length < 2) return

    interface HallwayData { nodes: NavNode[]; edges: NavEdge[] }
    const data: HallwayData[] = []

    for (const hw of hallways) {
      if (!hw.polygon || hw.polygon.length < 2) continue
      const hwNodes = hw.polygon.map(pos =>
        this.nodes.find(n => n.componentId === hw.id && n.position.lat === pos.lat && n.position.lng === pos.lng)
      ).filter((n): n is NavNode => n !== undefined)
      const hwEdges: NavEdge[] = []
      for (let i = 0; i < hwNodes.length - 1; i++) {
        const e = this.edges.find(edge =>
          (edge.from === hwNodes[i].id && edge.to === hwNodes[i + 1].id) ||
          (edge.to === hwNodes[i].id && edge.from === hwNodes[i + 1].id)
        )
        if (e) hwEdges.push(e)
      }
      if (hwEdges.length > 0) data.push({ nodes: hwNodes, edges: hwEdges })
    }

    const TARGET_THRESHOLD = 5
    const SAME_POS = 0.5

    const edgeExists = (a: string, b: string) =>
      this.edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a))

    const splitEdge = (edge: NavEdge, p1: LatLng, p2: LatLng, newNodeId: string) => {
      this.removeEdge(edge.id)
      const d1 = haversine(p1, this._nodePosition(edge.from))
      const d2 = haversine(this._nodePosition(edge.to), p2)
      this.addEdge({ ...edge, id: genId('E'), from: edge.from, to: newNodeId, distance: d1, weight: d1 })
      this.addEdge({ ...edge, id: genId('E'), from: newNodeId, to: edge.to, distance: d2, weight: d2 })
    }

    for (let ai = 0; ai < data.length; ai++) {
      for (let bi = ai + 1; bi < data.length; bi++) {
        const a = data[ai]
        const b = data[bi]

        for (let si = 0; si < a.nodes.length - 1; si++) {
          for (let sj = 0; sj < b.nodes.length - 1; sj++) {
            const p1 = a.nodes[si].position
            const p2 = a.nodes[si + 1].position
            const p3 = b.nodes[sj].position
            const p4 = b.nodes[sj + 1].position

            const intersection = lineSegmentIntersection(p1, p2, p3, p4)
            if (!intersection) continue
            if (this.nodes.some(n => haversine(n.position, intersection) < SAME_POS)) continue

            const newNode: NavNode = {
              id: genId('N'),
              label: `X: ${intersection.lat.toFixed(5)}, ${intersection.lng.toFixed(5)}`,
              name: 'Intersection',
              type: 'intersection',
              buildingId,
              campusId: this.campusId,
              floor,
              position: intersection,
            }
            this.addNode(newNode)

            const edgeA = this._edges.get(a.edges[si]?.id)
            if (edgeA) splitEdge(edgeA, p1, p2, newNode.id)
            const edgeB = this._edges.get(b.edges[sj]?.id)
            if (edgeB) splitEdge(edgeB, p3, p4, newNode.id)
          }
        }

        const connectEndpoint = (ep: NavNode, targetNodes: NavNode[], targetEdges: NavEdge[]) => {
          for (let sj = 0; sj < targetNodes.length - 1; sj++) {
            const d = pointToSegmentDistance(
              ep.position, targetNodes[sj].position, targetNodes[sj + 1].position
            )
            if (d > TARGET_THRESHOLD) continue

            const closest = closestPointOnSegment(
              ep.position, targetNodes[sj].position, targetNodes[sj + 1].position
            )
            const near = this.nodes.find(n => n.type === 'intersection' && haversine(n.position, closest) < SAME_POS)

            if (near) {
              if (!edgeExists(ep.id, near.id)) {
                const dist = haversine(ep.position, near.position)
                this.addEdge({ id: genId('E'), from: ep.id, to: near.id, type: 'corridor', distance: dist, weight: dist, campusId: this.campusId })
              }
              return
            }

            if (d < SAME_POS) return

            const newNode: NavNode = {
              id: genId('N'),
              label: `TJ: ${closest.lat.toFixed(5)}, ${closest.lng.toFixed(5)}`,
              name: 'Intersection',
              type: 'intersection',
              buildingId,
              campusId: this.campusId,
              floor,
              position: closest,
            }
            this.addNode(newNode)

            const edgeB = this._edges.get(targetEdges[sj]?.id)
            if (edgeB) {
              splitEdge(edgeB, targetNodes[sj].position, targetNodes[sj + 1].position, newNode.id)
            }

            const dist = haversine(ep.position, closest)
            this.addEdge({ id: genId('E'), from: ep.id, to: newNode.id, type: 'corridor', distance: dist, weight: dist, campusId: this.campusId })
            return
          }
        }

        const aEndpoints = [a.nodes[0], a.nodes[a.nodes.length - 1]].filter(Boolean)
        const bEndpoints = [b.nodes[0], b.nodes[b.nodes.length - 1]].filter(Boolean)

        for (const ep of aEndpoints) connectEndpoint(ep, b.nodes, b.edges)
        for (const ep of bEndpoints) connectEndpoint(ep, a.nodes, a.edges)
      }
    }
  }

  getAdjacencyList(): Record<string, { nodeId: string; weight: number }[]> {
    return getAdjacencyList(this.edges)
  }

  // ---- Derived Views ----

  getDirectory(): DirEntry[] {
    return buildDirectory(this)
  }

  validate(): ValidationResult[] {
    return validateGraph(this.nodes, this.edges, this.buildings)
  }

  // ---- Serialization ----

  toJSON(): GraphSnapshot {
    return {
      id: this.campusId || 'unknown',
      version: '1.0.0',
      campusId: this.campusId || 'asu-ibajay',
      updatedAt: new Date().toISOString(),
      buildings: this.buildings,
      nodes: this.nodes,
      edges: this.edges,
      components: this.components,
      traces: this.traces,
    }
  }

  static fromJSON(snapshot: GraphSnapshot): Graph {
    const graph = new Graph()
    graph.campusId = snapshot.campusId || 'asu-ibajay'
    graph.setBuildings(snapshot.buildings)
    graph.setNodes(snapshot.nodes)
    graph.setEdges(snapshot.edges)
    graph.setComponents(snapshot.components ?? [])
    if (snapshot.traces) graph.setTraces(snapshot.traces)
    return graph
  }

  // ---- Helpers ----

  private _nodePosition(nodeId: string): LatLng {
    return this._nodes.get(nodeId)?.position ?? { lat: 0, lng: 0 }
  }
}
