// ---- Studio UI Types ----

export type StudioTool =
  | 'select'
  | 'move'
  | 'room'
  | 'asset'
  | 'qr'
  | 'pano'
  | 'route'
  | 'boundary'
  | 'building'
  | 'wall'
  | 'door'
  | 'stairs'
  | 'vertex'
  | 'entrance'
  | 'elevator'
  | 'hallway'

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
