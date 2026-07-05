import { create } from 'zustand'
import { Graph } from '../engine/graph'
import type { NavNode, NavEdge, Building, Component, GraphSnapshot, TracePath } from '../types/nav-types'
import { compileComponent } from '../engine/component-compiler'

const STORAGE_KEY = 'navi-graph'
const SYNC_STATUS_KEY = 'navi-sync-status'

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface GraphState {
  graph: Graph
  currentMapId: string | null
  renderVersion: number
  syncStatus: SyncStatus
  syncError: string | null

  addNode: (node: NavNode) => void
  removeNode: (id: string) => void
  updateNode: (id: string, partial: Partial<NavNode>) => void

  addEdge: (edge: NavEdge) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, partial: Partial<NavEdge>) => void

  addBuilding: (building: Building) => void
  updateBuilding: (id: string, partial: Partial<Building>) => void
  removeBuilding: (id: string) => void

  addComponent: (component: Component) => void
  updateComponent: (id: string, partial: Partial<Component>) => void
  removeComponent: (id: string) => void
  addTrace: (trace: TracePath) => void
  updateTrace: (id: string, partial: Partial<TracePath>) => void
  removeTrace: (id: string) => void
  addComponentWithPolygon: (component: Component) => void

  setNodes: (nodes: NavNode[]) => void
  setEdges: (edges: NavEdge[]) => void
  setBuildings: (buildings: Building[]) => void

  loadMapData: (mapId: string) => void
  load: () => void
  save: () => void
  reset: () => void

  syncToSupabase: () => Promise<void>
  fetchFromSupabase: () => Promise<void>
}

function storageKey(mapId: string): string {
  return mapId ? `navi-graph-${mapId}` : STORAGE_KEY
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: new Graph(),
  currentMapId: null,
  renderVersion: 0,
  syncStatus: 'idle',
  syncError: null,

  addNode: (node) => {
    get().graph.addNode(node)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeNode: (id) => {
    get().graph.removeNode(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateNode: (id, partial) => {
    get().graph.updateNode(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addEdge: (edge) => {
    get().graph.addEdge(edge)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeEdge: (id) => {
    get().graph.removeEdge(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateEdge: (id, partial) => {
    get().graph.updateEdge(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addBuilding: (building) => {
    get().graph.addBuilding(building)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateBuilding: (id, partial) => {
    get().graph.updateBuilding(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeBuilding: (id) => {
    get().graph.removeBuilding(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setNodes: (nodes) => {
    get().graph.setNodes(nodes)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setEdges: (edges) => {
    get().graph.setEdges(edges)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setBuildings: (buildings) => {
    get().graph.setBuildings(buildings)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addComponent: (component: Component) => {
    const graph = get().graph
    const buildingsMap = new Map(graph.buildings.map((b) => [b.id, b]))
    const currentMapId = get().currentMapId
    const result = compileComponent(component, {
      buildings: buildingsMap,
      existingNodes: graph.nodes,
      existingEdges: graph.edges,
      componentId: component.id,
      campusId: component.campusId ?? currentMapId ?? undefined,
    })
    graph.addComponent({ ...component, polygon: component.polygon ?? result.polygon })
    for (const node of result.nodes) {
      graph.addNode(node)
    }
    for (const edge of result.edges) {
      graph.addEdge(edge)
    }
    if (component.type === 'hallway') {
      graph.syncHallwayIntersections(component.buildingId, component.floor)
    }
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateComponent: (id, partial) => {
    get().graph.updateComponent(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeComponent: (id) => {
    const graph = get().graph
    const component = graph.getComponent(id)
    graph.removeComponent(id)
    if (component?.type === 'entrance') {
      const building = graph.getBuilding(component.buildingId)
      if (building && building.entrances) {
        graph.updateBuilding(component.buildingId, {
          entrances: building.entrances.filter((e) => e.id !== id),
        })
      }
    }
    set({ renderVersion: get().renderVersion + 1 })
  },

  addTrace: (trace) => {
    const roomNodes = get().graph.nodes.filter(n => n.type === 'room')
    get().graph.addTraceWithCompile(trace, roomNodes)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateTrace: (id, partial) => {
    get().graph.updateTrace(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeTrace: (id) => {
    get().graph.removeTrace(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addComponentWithPolygon: (component: Component) => get().addComponent(component),

  load: async () => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      await get().fetchFromSupabase()
      return
    }
    try {
      const snapshot = JSON.parse(raw)
      const graph = Graph.fromJSON(snapshot)
      set({ graph })
    } catch {
      await get().fetchFromSupabase()
    }
  },

  loadMapData: (mapId: string) => {
    if (typeof window === 'undefined') return
    const key = storageKey(mapId)
    const raw = localStorage.getItem(key)
    let graph = new Graph()
    if (raw) {
      try {
        const snapshot = JSON.parse(raw)
        graph = Graph.fromJSON(snapshot)
      } catch {
        // ignore corrupt data
      }
    }
    set({ graph, currentMapId: mapId })
  },

  save: () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    const key = mapId ? storageKey(mapId) : STORAGE_KEY
    const json = get().graph.toJSON()
    localStorage.setItem(key, JSON.stringify(json))
    get().syncToSupabase()
  },

  reset: () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    const key = mapId ? storageKey(mapId) : STORAGE_KEY
    localStorage.removeItem(key)
    set({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
  },

  syncToSupabase: async () => {
    if (typeof window === 'undefined') return
    set({ syncStatus: 'syncing', syncError: null })
    try {
      const snapshot = get().graph.toJSON()
      const res = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify({ syncedAt: new Date().toISOString() }))
      set({ syncStatus: 'synced' })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sync failed'
        console.warn('[graph-store] syncToSupabase failed:', msg)
        set({ syncStatus: 'error', syncError: msg })
      }
  },

  fetchFromSupabase: async () => {
    if (typeof window === 'undefined') return
    set({ syncStatus: 'syncing' })
    try {
      const res = await fetch('/api/graph')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data || !data.nodes) {
        set({ syncStatus: 'idle' })
        return
      }
      const graph = Graph.fromJSON(data as GraphSnapshot)
      set({ graph, syncStatus: 'synced' })
    } catch (e) {
      console.warn('[graph-store] fetchFromSupabase failed:', e)
      set({ syncStatus: 'idle' })
    }
  },
}))
