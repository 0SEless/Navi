import { create } from 'zustand'
import { Graph } from '../engine/graph'
import type { NavNode, NavEdge, Building, Component, GraphSnapshot, TracePath } from '../types/nav-types'
import { compileComponent } from '../engine/component-compiler'

const STORAGE_KEY = 'navi-graph'
const SYNC_STATUS_KEY = 'navi-sync-status'

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface GraphState {
  graph: Graph
  syncStatus: SyncStatus
  syncError: string | null

  addNode: (node: NavNode) => void
  removeNode: (id: string) => void
  updateNode: (id: string, partial: Partial<NavNode>) => void

  addEdge: (edge: NavEdge) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, partial: Partial<NavEdge>) => void

  addBuilding: (building: Building) => void
  removeBuilding: (id: string) => void

  addComponent: (component: Component) => void
  removeComponent: (id: string) => void
  addTrace: (trace: TracePath) => void
  removeTrace: (id: string) => void
  addComponentWithPolygon: (component: Component) => void

  setNodes: (nodes: NavNode[]) => void
  setEdges: (edges: NavEdge[]) => void
  setBuildings: (buildings: Building[]) => void

  save: () => void
  load: () => void
  reset: () => void

  syncToSupabase: () => Promise<void>
  fetchFromSupabase: () => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: new Graph(),
  syncStatus: 'idle',
  syncError: null,

  addNode: (node) => {
    get().graph.addNode(node)
    set({})
  },

  removeNode: (id) => {
    get().graph.removeNode(id)
    set({})
  },

  updateNode: (id, partial) => {
    get().graph.updateNode(id, partial)
    set({})
  },

  addEdge: (edge) => {
    get().graph.addEdge(edge)
    set({})
  },

  removeEdge: (id) => {
    get().graph.removeEdge(id)
    set({})
  },

  updateEdge: (id, partial) => {
    get().graph.updateEdge(id, partial)
    set({})
  },

  addBuilding: (building) => {
    get().graph.addBuilding(building)
    set({})
  },

  removeBuilding: (id) => {
    get().graph.removeBuilding(id)
    set({})
  },

  setNodes: (nodes) => {
    get().graph.setNodes(nodes)
    set({})
  },

  setEdges: (edges) => {
    get().graph.setEdges(edges)
    set({})
  },

  setBuildings: (buildings) => {
    get().graph.setBuildings(buildings)
    set({})
  },

  addComponent: (component) => {
    const graph = get().graph
    const buildingsMap = new Map(graph.buildings.map((b) => [b.id, b]))
    const result = compileComponent(component, {
      buildings: buildingsMap,
      existingNodes: graph.nodes,
      existingEdges: graph.edges,
      componentId: component.id,
    })
    graph.addComponent({ ...component, polygon: result.polygon ?? component.polygon })
    for (const node of result.nodes) {
      graph.addNode(node)
    }
    for (const edge of result.edges) {
      graph.addEdge(edge)
    }
    set({})
  },

  removeComponent: (id) => {
    const graph = get().graph
    graph.removeComponent(id)
    set({})
  },

  addTrace: (trace) => {
    const roomNodes = get().graph.nodes.filter(n => n.type === 'room')
    get().graph.addTraceWithCompile(trace, roomNodes)
    set({})
  },

  removeTrace: (id) => {
    get().graph.removeTrace(id)
    set({})
  },

  addComponentWithPolygon: (component) => {
    const graph = get().graph
    const buildingsMap = new Map(graph.buildings.map((b) => [b.id, b]))
    const result = compileComponent(component, {
      buildings: buildingsMap,
      existingNodes: graph.nodes,
      existingEdges: graph.edges,
      componentId: component.id,
    })
    graph.addComponent({ ...component, polygon: result.polygon ?? component.polygon })
    for (const node of result.nodes) {
      graph.addNode(node)
    }
    for (const edge of result.edges) {
      graph.addEdge(edge)
    }
    set({})
  },

  save: () => {
    if (typeof window === 'undefined') return
    const json = get().graph.toJSON()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json))
  },

  load: () => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const snapshot = JSON.parse(raw)
        const graph = Graph.fromJSON(snapshot)
        set({ graph })
      } catch {
        // ignore corrupt data
      }
    }
    // Attempt Supabase fetch in background — does not block UI
    get().fetchFromSupabase()
  },

  reset: () => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
    set({ graph: new Graph(), syncStatus: 'idle', syncError: null })
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
    } catch {
      set({ syncStatus: 'idle' })
    }
  },
}))
