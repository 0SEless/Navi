import type {
  LatLng,
  LocalCoord,
  WorldPolygon,
  LocalPolygon,
  LocalPolyline,
  WorldPolyline,
} from './coordinates'
import type {
  BuildingCategory,
  RoomCategory,
  EntranceType,
  StaircaseType,
  RoadSurface,
  RoadType,
} from './enums'

// ── Core entity interfaces ──
// Per ADR-0007: outdoor entities use World coordinates, indoor use building-local.

export interface Building {
  id: string
  name: string
  code: string
  category: BuildingCategory
  description: string
  department?: string

  // Spatial (world coordinates)
  footprint: WorldPolygon
  baseElevation: number  // meters above sea level
  height: number         // meters

  // Structure
  floors: Floor[]

  // Visual
  color: string  // hex color for map rendering

  // Metadata
  aliases: string[]
  metadata: Record<string, unknown>
}

export interface Floor {
  id: string
  level: number           // 0 = ground, -1 = basement, 1 = second floor
  label: string           // "Ground Floor", "Mezzanine"
  elevation: number       // meters above building baseElevation
  planImageId?: string    // asset ID of floor plan image

  // Spatial features (all in building-local coordinates)
  rooms: Room[]
  hallways: Hallway[]
  staircases: Staircase[]
  elevators: Elevator[]
  entrances: Entrance[]

  // Asset references
  textureId?: string
  svgOverlayId?: string

  // Metadata
  metadata: Record<string, unknown>
}

export interface Room {
  id: string
  name: string
  number: string
  category: RoomCategory

  // Geometry in building-local meters
  polygon: LocalPolygon
  entrancePosition?: LocalCoord  // door location on polygon boundary

  capacity?: number
  metadata: Record<string, unknown>
}

export interface Hallway {
  id: string
  name: string
  polyline: LocalPolyline  // building-local meters
  width: number            // meters
  color?: string
}

export interface Staircase {
  id: string
  name: string
  position: LocalCoord     // building-local meters
  fromLevel: number
  toLevel: number
  type: StaircaseType
}

export interface Elevator {
  id: string
  name: string
  position: LocalCoord     // building-local meters
  fromLevel: number
  toLevel: number
}

export interface Entrance {
  id: string
  label: string
  position: LatLng         // world coordinates (on building footprint boundary)
  level: number
  type: EntranceType
  hasQR: boolean
  hasPanorama: boolean
  connectorRoadId?: string // road ID this entrance connects to
}

export interface Road {
  id: string
  name: string
  polyline: WorldPolyline  // world coordinates (lat/lng)
  width: number            // meters
  surface: RoadSurface
  type: RoadType
  connectorEntranceId?: string
  metadata: Record<string, unknown>
}

export interface PanoramaHotspot {
  target: {
    type: 'panorama' | 'room' | 'entrance' | 'qr' | 'url'
    targetId: string
  }
  position: {
    pitch: number  // degrees, -90 to 90
    yaw: number    // degrees, 0-360
  }
  label: string
}

export interface Panorama {
  id: string
  label: string
  position: LatLng          // world coordinates
  heading: number           // degrees, 0-360, initial camera heading
  imageAssetId: string      // asset ID of the panorama image
  buildingId?: string
  floor?: number
  hotspots: PanoramaHotspot[]
}

export interface QRCheckpoint {
  id: string
  label: string
  position: LatLng          // world coordinates
  floor: number
  buildingId: string
  code: string              // encoded data or URL
  metadata: Record<string, unknown>
}
