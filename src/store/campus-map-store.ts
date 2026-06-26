import { create } from 'zustand'
import type { CampusMap, LandmarkType, LandmarkInstance } from '../types/campus-map'

const STORAGE_KEY = 'navi-campus-maps'

interface CampusMapState {
  maps: CampusMap[]
  selectedMapId: string | null

  createMap: (data: Omit<CampusMap, 'id' | 'createdAt' | 'updatedAt' | 'stats'>) => string
  updateMap: (id: string, data: Partial<CampusMap>) => void
  deleteMap: (id: string) => void
  getMap: (id: string) => CampusMap | undefined
  selectMap: (id: string | null) => void
  updateMapStats: (id: string, stats: Partial<CampusMap['stats']>) => void

  landmarkTypes: LandmarkType[]
  landmarkInstances: LandmarkInstance[]
  addLandmarkType: (type: Omit<LandmarkType, 'id'>) => string
  updateLandmarkType: (id: string, data: Partial<LandmarkType>) => void
  removeLandmarkType: (id: string) => void
  getTypesByMap: (mapId: string) => LandmarkType[]
  addLandmarkInstance: (instance: Omit<LandmarkInstance, 'id'>) => string
  removeLandmarkInstance: (id: string) => void
  getInstancesByMap: (mapId: string) => LandmarkInstance[]

  load: () => void
  save: () => void
  reset: () => void
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const useCampusMapStore = create<CampusMapState>((set, get) => ({
  maps: [],
  selectedMapId: null,
  landmarkTypes: [],
  landmarkInstances: [],

  createMap: (data) => {
    const id = `map-${generateId()}`
    const now = new Date().toISOString()
    const map: CampusMap = { ...data, id, createdAt: now, updatedAt: now, stats: { buildings: 0, nodes: 0, edges: 0 } }
    set((s) => ({ maps: [...s.maps, map] }))
    get().save()
    return id
  },

  updateMap: (id, data) => {
    set((s) => ({ maps: s.maps.map((m) => (m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString() } : m)) }))
    get().save()
  },

  deleteMap: (id) => {
    set((s) => ({
      maps: s.maps.filter((m) => m.id !== id),
      selectedMapId: s.selectedMapId === id ? null : s.selectedMapId,
      landmarkTypes: s.landmarkTypes.filter((t) => t.mapId !== id),
      landmarkInstances: s.landmarkInstances.filter((i) => i.mapId !== id),
    }))
    get().save()
  },

  getMap: (id) => get().maps.find((m) => m.id === id),
  selectMap: (id) => set({ selectedMapId: id }),

  updateMapStats: (id, stats) => {
    set((s) => ({
      maps: s.maps.map((m) => (m.id === id ? { ...m, stats: { ...m.stats, ...stats }, updatedAt: new Date().toISOString() } : m)),
    }))
    get().save()
  },

  addLandmarkType: (type) => {
    const id = `ltype-${generateId()}`
    set((s) => ({ landmarkTypes: [...s.landmarkTypes, { ...type, id }] }))
    get().save()
    return id
  },

  updateLandmarkType: (id, data) => {
    set((s) => ({ landmarkTypes: s.landmarkTypes.map((t) => (t.id === id ? { ...t, ...data } : t)) }))
    get().save()
  },

  removeLandmarkType: (id) => {
    set((s) => ({
      landmarkTypes: s.landmarkTypes.filter((t) => t.id !== id),
      landmarkInstances: s.landmarkInstances.filter((i) => i.typeId !== id),
    }))
    get().save()
  },

  getTypesByMap: (mapId) => get().landmarkTypes.filter((t) => t.mapId === mapId),

  addLandmarkInstance: (instance) => {
    const id = `lminst-${generateId()}`
    set((s) => ({ landmarkInstances: [...s.landmarkInstances, { ...instance, id }] }))
    get().save()
    return id
  },

  removeLandmarkInstance: (id) => {
    set((s) => ({ landmarkInstances: s.landmarkInstances.filter((i) => i.id !== id) }))
    get().save()
  },

  getInstancesByMap: (mapId) => get().landmarkInstances.filter((i) => i.mapId === mapId),

  load: () => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        set({
          maps: data.maps || [],
          landmarkTypes: data.landmarkTypes || [],
          landmarkInstances: data.landmarkInstances || [],
        })
      }
    } catch { /* corrupt */ }
  },

  save: () => {
    if (typeof window === 'undefined') return
    const { maps, landmarkTypes, landmarkInstances } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ maps, landmarkTypes, landmarkInstances }))
  },

  reset: () => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
    set({ maps: [], selectedMapId: null, landmarkTypes: [], landmarkInstances: [] })
  },
}))
