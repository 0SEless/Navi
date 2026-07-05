import { create } from 'zustand'
import type { StudioTool, EditorMode, LayerVisibility } from '../types/studio-types'
import type { LatLng } from '../types/nav-types'


type PendingType = 'building' | 'boundary' | 'route' | null

interface PendingConfirm {
  type: NonNullable<PendingType>
  points: { lat: number; lng: number }[]
}

interface StudioState {
  tool: StudioTool
  editorMode: EditorMode
  activeBuildingId: string | null
  activeFloor: number
  layers: LayerVisibility

  setTool: (tool: StudioTool) => void
  setEditorMode: (mode: EditorMode) => void
  setActiveBuilding: (id: string | null) => void
  setActiveFloor: (floor: number) => void
  toggleLayer: (layer: keyof LayerVisibility) => void
  setLayers: (layers: Partial<LayerVisibility>) => void

  tracePoints: { lat: number; lng: number }[]
  addTracePoint: (point: { lat: number; lng: number }) => void
  setTracePoints: (points: { lat: number; lng: number }[]) => void
  clearTracePoints: () => void
  undoLastTracePoint: () => void

  pendingConfirm: PendingConfirm | null
  setPendingConfirm: (type: PendingType, points: { lat: number; lng: number }[]) => void
  clearPendingConfirm: () => void

  selectedTraceId: string | null
  setSelectedTraceId: (id: string | null) => void

  drawPoints: LatLng[]
  setDrawPoints: (points: LatLng[]) => void
  clearDrawPoints: () => void

  routeWidth: number
  setRouteWidth: (width: number) => void

  isVertexEditing: boolean
  editTargetType: 'trace' | 'building' | 'boundary' | 'room' | null
  editTargetId: string | null
  setVertexEditing: (targetType: StudioState['editTargetType'], targetId: string | null) => void
}

const defaultLayers: LayerVisibility = {
  osm: true,
  satellite: false,
  floor_plan: false,
  buildings: true,
  rooms: true,
  hallways: true,
  assets: true,
  nodes: false,
  edges: false,
  labels: true,
}

export const useStudioStore = create<StudioState>((set) => ({
  tool: 'select',
  editorMode: 'campus',
  activeBuildingId: null,
  activeFloor: 0,
  layers: { ...defaultLayers },
  tracePoints: [],
  drawPoints: [],
  routeWidth: 8,

  setTool: (tool) => set({ tool }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setActiveBuilding: (id) => set((s) => ({ activeBuildingId: id, activeFloor: id === s.activeBuildingId ? s.activeFloor : 0 })),
  setActiveFloor: (floor) => set({ activeFloor: floor }),
  toggleLayer: (layer) => set((s) => ({
    layers: { ...s.layers, [layer]: !s.layers[layer] },
  })),
  setLayers: (layers) => set((s) => ({
    layers: { ...s.layers, ...layers },
  })),

  addTracePoint: (point) => set((s) => ({
    tracePoints: [...s.tracePoints, point],
  })),
  setTracePoints: (points) => set({ tracePoints: points }),
  clearTracePoints: () => set({ tracePoints: [] }),
  undoLastTracePoint: () => set((s) => ({
    tracePoints: s.tracePoints.slice(0, -1),
  })),

  pendingConfirm: null,
  setPendingConfirm: (type, points) => set({ pendingConfirm: type ? { type, points } : null }),
  clearPendingConfirm: () => set({ pendingConfirm: null }),

  selectedTraceId: null,
  setSelectedTraceId: (id) => set({ selectedTraceId: id }),

  isVertexEditing: false,
  editTargetType: null,
  editTargetId: null,
  setVertexEditing: (targetType, targetId) => set({
    isVertexEditing: targetType !== null,
    editTargetType: targetType,
    editTargetId: targetId,
    tool: targetType !== null ? 'vertex' : 'select',
  }),

  setRouteWidth: (width) => set({ routeWidth: Math.max(2, Math.min(24, width)) }),

  setDrawPoints: (points) => set({ drawPoints: points }),
  clearDrawPoints: () => set({ drawPoints: [] }),
}))
