/** One-time import of the old ASU Ibajay map (navi-development) into Save v2 with the trial terrain. */

export interface LatLngPoint {
  lat: number
  lng: number
}

/** What the import reads from navi-development for one campus (read only). */
export interface OldMapExport {
  campusId: string
  name: string
  schoolName: string | null
  center: LatLngPoint
  boundary: LatLngPoint[]
  /** The authored CampusDocument (graph_snapshots.authored_document), untouched. */
  document: Record<string, unknown>
}

/** What the import reads from the Save v2 trial campus: only its terrain. */
export interface TrialTerrainExport {
  campusId: string
  /** The `terrain` part content: { terrain?, terrainAreas?, terrainVerticalDatum? }. */
  terrain: Record<string, unknown>
  tiles: Array<{ tileId: string; contentBase64: string }>
}

export interface TerrainGridOrigin {
  originLat: number
  originLng: number
}

export interface DryRunReport {
  ok: boolean
  problems: string[]
  counts: {
    buildings: number
    floors: Record<string, number>
    roads: number
    junctions: number
    pois: number
    terrainTiles: number
  }
  originBefore: TerrainGridOrigin
  originAfter: TerrainGridOrigin | null
  /** Share (0–1) of boundary points that fall outside the copied terrain tiles. */
  boundaryOutsideTiles: number
  /** Local-only floor fields (plan images) that Save v2 never stores; listed, not blocking. */
  notStored: string[]
  partKeys: string[]
  exportHash: string
}
