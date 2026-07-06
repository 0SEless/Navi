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
    const nodesToDelete: string[] = []

    for (const [nid, node] of this._nodes) {
      const meta = node.metadata as Record<string, unknown> | undefined
      if (!meta) continue

      const metaTraceId = meta.traceId as string | undefined
      const metaTraceIds = meta.traceIds as string[] | undefined

      if (metaTraceIds?.includes(id)) {
        // Shared intersection node — remove this trace's ID
        const remaining = metaTraceIds.filter(tid => tid !== id)
        if (remaining.length > 0) {
          node.metadata = { ...meta, traceIds: remaining }
        } else {
          nodesToDelete.push(nid)
        }
      } else if (metaTraceId === id && !metaTraceIds?.length) {
        // Fully owned node (only has traceId, no traceIds array)
        nodesToDelete.push(nid)
      }
    }

    for (const nid of nodesToDelete) {
      this._nodes.delete(nid)
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
    const result = compileTrace(
      trace,
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
    this.syncTraceIntersections(trace.id)
  }

  recompileTrace(id: string): void {
    const trace = this._traces.get(id)
    if (!trace) return

    // 1. Collect old nodes for this trace, handling shared intersection nodes
    const fullyOwned: string[] = []
    const sharedNodes: { nodeId: string; traceIds: string[] }[] = []
    for (const [nid, node] of this._nodes) {
      const meta = node.metadata as Record<string, unknown> | undefined
      const metaTraceId = meta?.traceId as string | undefined
      const metaTraceIds = meta?.traceIds as string[] | undefined
      if (metaTraceId === id && (!metaTraceIds || metaTraceIds.length <= 1)) {
        // Fully owned by this trace (single traceId or just traceId field)
        fullyOwned.push(nid)
      } else if (metaTraceIds?.includes(id)) {
        // Shared intersection node — remove this trace's ID
        sharedNodes.push({ nodeId: nid, traceIds: metaTraceIds.filter(tid => tid !== id) })
      }
    }

    // 2. Update shared nodes: remove this trace's ID
    for (const { nodeId, traceIds } of sharedNodes) {
      const node = this._nodes.get(nodeId)!
      if (traceIds.length > 0) {
        node.metadata = { ...node.metadata, traceIds }
      } else {
        // No other traces reference it — delete
        fullyOwned.push(nodeId)
      }
    }

    // 3. Remove fully owned nodes
    for (const nid of fullyOwned) {
      this._nodes.delete(nid)
    }

    // 4. Remove orphaned edges
    for (const [eid, edge] of this._edges) {
      if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
        this._edges.delete(eid)
      }
    }

    // 5. Recompile with updated trace points
    const result = compileTrace(trace, this.nodes, this.edges)
    for (const node of result.nodes) {
      node.metadata = { ...node.metadata, traceId: trace.id }
      this.addNode(node)
    }
    for (const edge of result.edges) {
      this.addEdge(edge)
    }

    // 6. Re-run intersection detection against other routes
    this.syncTraceIntersections(id)

    // 7. Invalidate all caches
    this._cachedTraces = null
    this._cachedNodes = null
    this._cachedEdges = null
  }

  connectNodes(idA: string, idB: string): NavEdge | null {
    const nodeA = this._nodes.get(idA)
    const nodeB = this._nodes.get(idB)
    if (!nodeA || !nodeB) return null
    const edgeExists = this.edges.some(
      (e) => (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA)
    )
    if (edgeExists) return null
    const d = haversine(nodeA.position, nodeB.position)
    const edge: NavEdge = {
      id: genId('E'), from: idA, to: idB,
      type: 'walk', distance: d, weight: d,
      campusId: nodeA.campusId,
    }
    this.addEdge(edge)
    return edge
  }

  splitEdge(edgeId: string, position: LatLng): NavNode | null {
    const edge = this._edges.get(edgeId)
    if (!edge) return null
    const id = genId('N')
    const fromPos = this._nodePosition(edge.from)
    const toPos = this._nodePosition(edge.to)
    const d1 = haversine(position, fromPos)
    const d2 = haversine(position, toPos)
    const node: NavNode = {
      id, label: 'Connection', name: 'Connection',
      type: 'intersection',
      buildingId: this._nodes.get(edge.from)?.buildingId ?? '',
      campusId: edge.campusId ?? '',
      floor: this._nodes.get(edge.from)?.floor ?? 0,
      position,
      metadata: { connectionNode: true, traceId: this._nodes.get(edge.from)?.metadata?.traceId },
    }
    this.removeEdge(edgeId)
    this.addNode(node)
    this.addEdge({
      id: genId('E'), from: edge.from, to: id,
      type: edge.type, distance: d1, weight: d1, campusId: edge.campusId,
    })
    this.addEdge({
      id: genId('E'), from: id, to: edge.to,
      type: edge.type, distance: d2, weight: d2, campusId: edge.campusId,
    })
    return node
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

  syncTraceIntersections(traceId: string): void {
    const trace = this._traces.get(traceId)
    if (!trace || trace.points.length < 2) return

    const TARGET_THRESHOLD = 5
    const SAME_POS = 0.5

    // Collect new trace's compiled nodes
    const newNodes = this.nodes.filter(n => n.metadata?.traceId === traceId)
    if (newNodes.length < 2) return

    // Get existing traces (excluding the one being added/recompiled)
    const existingTraces = this.traces.filter(t => t.id !== traceId && t.points.length >= 2)
    if (existingTraces.length === 0) return

    // Build ordered node+edge chain for each existing trace
    const chains: { traceId: string; nodes: NavNode[]; edges: NavEdge[] }[] = []
    for (const et of existingTraces) {
      const nodes: NavNode[] = []
      for (const p of et.points) {
        const n = this.nodes.find(nn =>
          nn.metadata?.traceId === et.id &&
          Math.abs(nn.position.lat - p.lat) < 0.00001 &&
          Math.abs(nn.position.lng - p.lng) < 0.00001
        )
        if (n) nodes.push(n)
      }
      if (nodes.length < 2) continue
      const edges: NavEdge[] = []
      for (let i = 0; i < nodes.length - 1; i++) {
        const e = this.edges.find(edge =>
          (edge.from === nodes[i].id && edge.to === nodes[i + 1].id) ||
          (edge.from === nodes[i + 1].id && edge.to === nodes[i].id)
        )
        if (e) edges.push(e)
      }
      if (edges.length > 0) chains.push({ traceId: et.id, nodes, edges })
    }
    if (chains.length === 0) return

    const edgeExists = (a: string, b: string) =>
      this.edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a))

    // ---- Phase 1: Endpoint T-junctions ----
    const endpoints = [newNodes[0], newNodes[newNodes.length - 1]]
    for (const ep of endpoints) {
      for (const chain of chains) {
        for (let sj = 0; sj < chain.nodes.length - 1; sj++) {
          const d = pointToSegmentDistance(
            ep.position, chain.nodes[sj].position, chain.nodes[sj + 1].position
          )
          if (d > TARGET_THRESHOLD) continue

          const closest = closestPointOnSegment(
            ep.position, chain.nodes[sj].position, chain.nodes[sj + 1].position
          )

          // Snap trace endpoint to the closest point (trim excess)
          if (ep === newNodes[0]) {
            trace.points[0] = { ...closest }
          } else {
            trace.points[trace.points.length - 1] = { ...closest }
          }
          ep.position = { ...closest }

          // Check for existing node at the closest point
          const near = this.nodes.find(n =>
            n.type === 'intersection' && haversine(n.position, closest) < SAME_POS
          )

          let intersectionNode: NavNode
          if (near) {
            intersectionNode = near
            const meta = near.metadata || {}
            const existingIds = (meta.traceIds as string[]) || (meta.traceId ? [meta.traceId as string] : [])
            const ids = [...new Set([...existingIds, traceId, chain.traceId])]
            near.metadata = { ...meta, traceIds: ids, connectionNode: true }
          } else {
            // Capture edge info before splitting
            const edgeFrom = chain.edges[sj].from
            const edgeTo = chain.edges[sj].to
            const edgeType = chain.edges[sj].type
            const edgeCampusId = chain.edges[sj].campusId

            const id = genId('N')
            const buildingId = trace.buildingId ?? chain.nodes[sj].buildingId
            intersectionNode = {
              id, label: 'Route Junction', name: 'Route Junction',
              type: 'intersection',
              campusId: trace.campusId ?? '',
              floor: trace.floor,
              buildingId,
              position: closest,
              metadata: { traceIds: [chain.traceId, traceId], connectionNode: true },
            }
            this.removeEdge(chain.edges[sj].id)
            this.addNode(intersectionNode)
            this.addEdge({
              id: genId('E'), from: edgeFrom, to: id,
              type: edgeType,
              distance: haversine(this._nodePosition(edgeFrom), closest),
              weight: haversine(this._nodePosition(edgeFrom), closest),
              campusId: edgeCampusId ?? '',
            })
            this.addEdge({
              id: genId('E'), from: id, to: edgeTo,
              type: edgeType,
              distance: haversine(closest, this._nodePosition(edgeTo)),
              weight: haversine(closest, this._nodePosition(edgeTo)),
              campusId: edgeCampusId ?? '',
            })
          }

          // Connect the new trace's endpoint node to the intersection node
          if (!edgeExists(ep.id, intersectionNode.id)) {
            const dist = haversine(ep.position, intersectionNode.position)
            this.addEdge({
              id: genId('E'), from: ep.id, to: intersectionNode.id,
              type: 'walk', distance: dist, weight: dist,
              campusId: trace.campusId ?? '',
            })
          }
          break // only one connection per endpoint
        }
      }
    }

    // ---- Phase 2: Crossings (X-intersections) ----
    for (let si = 0; si < newNodes.length - 1; si++) {
      for (const chain of chains) {
        for (let sj = 0; sj < chain.nodes.length - 1; sj++) {
          const intersection = lineSegmentIntersection(
            newNodes[si].position, newNodes[si + 1].position,
            chain.nodes[sj].position, chain.nodes[sj + 1].position
          )
          if (!intersection) continue
          if (this.nodes.some(n => haversine(n.position, intersection) < SAME_POS)) continue

          // Capture edge info before splitting
          const edgeId = chain.edges[sj].id
          const edgeFrom = chain.edges[sj].from
          const edgeTo = chain.edges[sj].to
          const edgeType = chain.edges[sj].type
          const edgeCampusId = chain.edges[sj].campusId

          const id = genId('N')
          const buildingId = trace.buildingId ?? chain.nodes[sj].buildingId
          const intersectionNode: NavNode = {
            id, label: 'Route Junction', name: 'Route Junction',
            type: 'intersection',
            campusId: trace.campusId ?? '',
            floor: trace.floor,
            buildingId,
            position: intersection,
            metadata: { traceIds: [chain.traceId, traceId], connectionNode: true },
          }
          this.removeEdge(edgeId)
          this.addNode(intersectionNode)
          this.addEdge({
            id: genId('E'), from: edgeFrom, to: id,
            type: edgeType,
            distance: haversine(this._nodePosition(edgeFrom), intersection),
            weight: haversine(this._nodePosition(edgeFrom), intersection),
            campusId: edgeCampusId ?? '',
          })
          this.addEdge({
            id: genId('E'), from: id, to: edgeTo,
            type: edgeType,
            distance: haversine(intersection, this._nodePosition(edgeTo)),
            weight: haversine(intersection, this._nodePosition(edgeTo)),
            campusId: edgeCampusId ?? '',
          })

          // Connect the closer new trace node to the intersection
          const dFrom = haversine(newNodes[si].position, intersection)
          const dTo = haversine(newNodes[si + 1].position, intersection)
          const closestNode = dFrom <= dTo ? newNodes[si] : newNodes[si + 1]
          if (!edgeExists(closestNode.id, id)) {
            const dist = haversine(closestNode.position, intersection)
            this.addEdge({
              id: genId('E'), from: closestNode.id, to: id,
              type: 'walk', distance: dist, weight: dist,
              campusId: trace.campusId ?? '',
            })
          }
        }
      }
    }

    this._cachedNodes = null
    this._cachedEdges = null
    this._cachedTraces = null
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
