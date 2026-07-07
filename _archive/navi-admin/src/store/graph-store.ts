import { create } from 'zustand'
import { Graph } from '../engine/graph'
import type { NavNode, NavEdge, Building, Component, GraphSnapshot } from '../types/nav-types'
import type { CompileContext } from '../engine/component-compiler'
import { compileComponent } from '../engine/component-compiler'

const STORAGE_KEY = 'navi-graph'
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export type SyncStatus = 'idle' | 'saving' | 'loading' | 'error'

interface GraphState {
  graph: Graph
  syncStatus: SyncStatus
  syncError: string | null

  // Node operations
  addNode: (node: NavNode) => void
  removeNode: (id: string) => void
  updateNode: (id: string, partial: Partial<NavNode>) => void

  // Edge operations
  addEdge: (edge: NavEdge) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, partial: Partial<NavEdge>) => void

  // Building operations
  addBuilding: (building: Building) => void
  removeBuilding: (id: string) => void

  // Component operations
  addComponent: (component: Component) => void
  removeComponent: (id: string) => void

  // Bulk operations
  setNodes: (nodes: NavNode[]) => void
  setEdges: (edges: NavEdge[]) => void
  setBuildings: (buildings: Building[]) => void

  // Persistence
  save: () => void
  load: () => void
  reset: () => void

  // Server sync
  saveToServer: (campusId?: string) => Promise<void>
  loadFromServer: (campusId?: string) => Promise<void>
}

let _serverDebounceTimer: ReturnType<typeof setTimeout> | null = null

function debounceServerSave(get: () => GraphState, delay = 2000): void {
  if (_serverDebounceTimer) clearTimeout(_serverDebounceTimer)
  _serverDebounceTimer = setTimeout(() => {
    get().saveToServer()
  }, delay)
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: new Graph(),
  syncStatus: 'idle',
  syncError: null,

  addNode: (node) => {
    get().graph.addNode(node)
    set({})
    debounceServerSave(get)
  },

  removeNode: (id) => {
    get().graph.removeNode(id)
    set({})
    debounceServerSave(get)
  },

  updateNode: (id, partial) => {
    get().graph.updateNode(id, partial)
    set({})
    debounceServerSave(get)
  },

  addEdge: (edge) => {
    get().graph.addEdge(edge)
    set({})
    debounceServerSave(get)
  },

  removeEdge: (id) => {
    get().graph.removeEdge(id)
    set({})
    debounceServerSave(get)
  },

  updateEdge: (id, partial) => {
    get().graph.updateEdge(id, partial)
    set({})
    debounceServerSave(get)
  },

  addBuilding: (building) => {
    get().graph.addBuilding(building)
    set({})
    debounceServerSave(get)
  },

  removeBuilding: (id) => {
    get().graph.removeBuilding(id)
    set({})
    debounceServerSave(get)
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
    graph.addComponent(component)
    for (const node of result.nodes) {
      graph.addNode(node)
    }
    for (const edge of result.edges) {
      graph.addEdge(edge)
    }
    set({})
    debounceServerSave(get)
  },

  removeComponent: (id) => {
    const graph = get().graph
    graph.removeComponent(id)
    set({})
    debounceServerSave(get)
  },

  save: () => {
    const json = get().graph.toJSON()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json))
  },

  load: () => {
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
  },

  reset: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ graph: new Graph() })
  },

  saveToServer: async (campusId = 'asu-ibajay') => {
    try {
      set({ syncStatus: 'saving', syncError: null })
      const snapshot = get().graph.toJSON()
      snapshot.campusId = campusId
      const res = await fetch(`${API_BASE_URL}/api/graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      set({ syncStatus: 'idle' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save to server'
      set({ syncStatus: 'error', syncError: msg })
    }
  },

  loadFromServer: async (campusId = 'asu-ibajay') => {
    try {
      set({ syncStatus: 'loading', syncError: null })
      const res = await fetch(`${API_BASE_URL}/api/graph?campus_id=${campusId}`)
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const snapshot: GraphSnapshot = await res.json()
      const graph = Graph.fromJSON(snapshot)
      set({ graph, syncStatus: 'idle' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load from server'
      set({ syncStatus: 'error', syncError: msg })
    }
  },
}))
