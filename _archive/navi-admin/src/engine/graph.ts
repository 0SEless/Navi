import type {
  NavNode, NavEdge, Building, Component, LatLng,
  GraphSnapshot, PathResult, ValidationResult, DirEntry,
} from '../types/nav-types'
import { aStar, getAdjacencyList } from './a-star'
import { validateGraph } from './graph-validator'
import { buildDirectory } from './directory'

export class Graph {
  private _nodes: Map<string, NavNode> = new Map()
  private _edges: Map<string, NavEdge> = new Map()
  private _buildings: Map<string, Building> = new Map()
  private _components: Map<string, Component> = new Map()

  // ---- Accessors ----

  get nodes(): NavNode[] {
    return Array.from(this._nodes.values())
  }

  get edges(): NavEdge[] {
    return Array.from(this._edges.values())
  }

  get buildings(): Building[] {
    return Array.from(this._buildings.values())
  }

  get components(): Component[] {
    return Array.from(this._components.values())
  }

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
  }

  addEdge(edge: NavEdge): void {
    this._edges.set(edge.id, edge)
  }

  removeNode(id: string): void {
    this._nodes.delete(id)
    for (const [eid, edge] of this._edges) {
      if (edge.from === id || edge.to === id) {
        this._edges.delete(eid)
      }
    }
  }

  removeEdge(id: string): void {
    this._edges.delete(id)
  }

  updateNode(id: string, partial: Partial<NavNode>): void {
    const existing = this._nodes.get(id)
    if (existing) {
      this._nodes.set(id, { ...existing, ...partial })
    }
  }

  updateEdge(id: string, partial: Partial<NavEdge>): void {
    const existing = this._edges.get(id)
    if (existing) {
      this._edges.set(id, { ...existing, ...partial })
    }
  }

  addBuilding(building: Building): void {
    this._buildings.set(building.id, building)
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
  }

  // ---- Component Operations ----

  addComponent(component: Component): void {
    this._components.set(component.id, component)
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
  }

  getNodesByComponent(componentId: string): NavNode[] {
    return this.nodes.filter((n) => n.componentId === componentId)
  }

  // ---- Bulk Operations ----

  setNodes(nodes: NavNode[]): void {
    this._nodes.clear()
    for (const n of nodes) this._nodes.set(n.id, n)
  }

  setEdges(edges: NavEdge[]): void {
    this._edges.clear()
    for (const e of edges) this._edges.set(e.id, e)
  }

  setBuildings(buildings: Building[]): void {
    this._buildings.clear()
    for (const b of buildings) this._buildings.set(b.id, b)
  }

  setComponents(components: Component[]): void {
    this._components.clear()
    for (const c of components) this._components.set(c.id, c)
  }

  // ---- Queries ----

  findPath(fromId: string, toId: string): PathResult | null {
    return aStar(this.nodes, this.edges, fromId, toId)
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
      const d = this._haversine(position, node.position)
      if (d < minDist) {
        minDist = d
        nearest = node
      }
    }
    return nearest
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
      version: '1.0.0',
      campusId: 'asu-ibajay',
      buildings: this.buildings,
      nodes: this.nodes,
      edges: this.edges,
      components: this.components,
      exportedAt: new Date().toISOString(),
    }
  }

  static fromJSON(snapshot: GraphSnapshot): Graph {
    const graph = new Graph()
    graph.setBuildings(snapshot.buildings)
    graph.setNodes(snapshot.nodes)
    graph.setEdges(snapshot.edges)
    graph.setComponents(snapshot.components ?? [])
    return graph
  }

  // ---- Helpers ----

  private _haversine(a: LatLng, b: LatLng): number {
    const R = 6371000
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const sinDLat = Math.sin(dLat / 2)
    const sinDLng = Math.sin(dLng / 2)
    const aVal =
      sinDLat * sinDLat +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        sinDLng * sinDLng
    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
  }
}
