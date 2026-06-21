import { create } from 'zustand'

export type Tool = 'select' | 'add_node' | 'add_edge' | 'pan' | 'delete' | 'building_box' | 'record_path'
export type MapView = 'real' | 'auto_svg' | 'classic_svg'
export type BuildingBoxMode = 'rectangle' | 'polygon'
export type EditorMode = 'basic' | 'component'

interface UiState {
  tool: Tool
  selectedNode: string | null
  selectedEdge: string | null
  activeFloor: number
  view: MapView
  zoom: number
  boxMode: BuildingBoxMode
  editorMode: EditorMode
  componentType: string | null

  setTool: (tool: Tool) => void
  setSelectedNode: (id: string | null) => void
  setSelectedEdge: (id: string | null) => void
  setActiveFloor: (floor: number) => void
  setView: (view: MapView) => void
  setZoom: (zoom: number) => void
  setBoxMode: (mode: BuildingBoxMode) => void
  setEditorMode: (mode: EditorMode) => void
  setComponentType: (type: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  tool: 'select',
  selectedNode: null,
  selectedEdge: null,
  activeFloor: 0,
  view: 'real',
  zoom: 1,
  boxMode: 'rectangle',
  editorMode: 'basic',
  componentType: null,

  setTool: (tool) => set({ tool, selectedNode: null, selectedEdge: null }),
  setSelectedNode: (id) => set({ selectedNode: id, selectedEdge: null }),
  setSelectedEdge: (id) => set({ selectedEdge: id, selectedNode: null }),
  setActiveFloor: (floor) => set({ activeFloor: floor }),
  setView: (view) => set({ view }),
  setZoom: (zoom) => set({ zoom: Math.max(0.3, Math.min(3, zoom)) }),
  setBoxMode: (mode) => set({ boxMode: mode }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setComponentType: (type) => set({ componentType: type }),
}))
