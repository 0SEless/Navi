// ---- Studio UI Types ----

export type StudioTool =
  | 'select'
  | 'move'
  | 'trace'
  | 'room'
  | 'asset'
  | 'qr'
  | 'pano'
  | 'route_test'

export type EditorMode = 'campus' | 'building' | 'floor'

export type LayerType =
  | 'osm'
  | 'satellite'
  | 'floor_plan'
  | 'buildings'
  | 'rooms'
  | 'hallways'
  | 'assets'
  | 'nodes'
  | 'edges'
  | 'labels'

export type TraceMode = 'hallway' | 'path'

export type RoomPreset = 'rectangle' | 'lshape' | 'freeform'

export interface StudioViewState {
  center: { lat: number; lng: number }
  zoom: number
  activeFloor: number
  activeBuildingId: string | null
}

export interface LayerVisibility {
  osm: boolean
  satellite: boolean
  floor_plan: boolean
  buildings: boolean
  rooms: boolean
  hallways: boolean
  assets: boolean
  nodes: boolean
  edges: boolean
  labels: boolean
}
