import { create } from 'zustand'
import type { StudioTool, EditorMode, LayerVisibility, TraceMode } from '../types/studio-types'


type PendingType = 'building' | 'boundary' | 'trace' | null

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
  isTraceActive: boolean
  traceMode: TraceMode

  setTool: (tool: StudioTool) => void
  setEditorMode: (mode: EditorMode) => void
  setActiveBuilding: (id: string | null) => void
  setActiveFloor: (floor: number) => void
  toggleLayer: (layer: keyof LayerVisibility) => void
  setLayers: (layers: Partial<LayerVisibility>) => void
  setTraceActive: (active: boolean) => void
  setTraceMode: (mode: TraceMode) => void

  tracePoints: { lat: number; lng: number }[]
  addTracePoint: (point: { lat: number; lng: number }) => void
  clearTracePoints: () => void
  undoLastTracePoint: () => void

  pendingConfirm: PendingConfirm | null
  setPendingConfirm: (type: PendingType, points: { lat: number; lng: number }[]) => void
  clearPendingConfirm: () => void

  selectedTraceId: string | null
  setSelectedTraceId: (id: string | null) => void

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
  isTraceActive: false,
  traceMode: 'path',
  tracePoints: [],

  setTool: (tool) => set({ tool, traceMode: tool === 'route_test' || tool === 'trace' ? (tool === 'route_test' ? 'arterial' : 'interior') : 'path' }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setActiveBuilding: (id) => set((s) => ({ activeBuildingId: id, activeFloor: id === s.activeBuildingId ? s.activeFloor : 0 })),
  setActiveFloor: (floor) => set({ activeFloor: floor }),
  toggleLayer: (layer) => set((s) => ({
    layers: { ...s.layers, [layer]: !s.layers[layer] },
  })),
  setLayers: (layers) => set((s) => ({
    layers: { ...s.layers, ...layers },
  })),
  setTraceActive: (active) => set({
    isTraceActive: active,
    tracePoints: [],
  }),
  setTraceMode: (mode) => set({ traceMode: mode }),

  addTracePoint: (point) => set((s) => ({
    tracePoints: [...s.tracePoints, point],
  })),
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
}))
