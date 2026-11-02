/** What "0 m" means for this campus's heights (set once in the terrain workspace). */
export interface TerrainReference {
  name: string
  zeroMeaning: string
}

/** The 1 m height grid: its south-west corner is the corner of tile 0_0. Never moves after creation. */
export interface TerrainGrid {
  originLat: number
  originLng: number
}

/** The imported or traced ground that the base layer is rebuilt from. */
export type TerrainBaseSource =
  | {
      kind: 'mesh'
      vertices: Array<[lat: number, lng: number, heightM: number]>
      triangles: Array<[number, number, number]>
      sourceNote: string
    }
  | {
      kind: 'contours'
      lines: Array<{ elevationM: number; points: Array<{ lat: number; lng: number }> }>
      sourceNote: string
    }

/** Campus terrain settings (stored in the `terrain` part). Changes live in `CampusDocument.terrainTiles`. */
export interface CampusTerrain {
  reference: TerrainReference
  grid: TerrainGrid
  base?: TerrainBaseSource
  /** Heights-view colour scale: green at minM, red at maxM. */
  colorRange: { minM: number; maxM: number }
}

/** `${col}_${row}` of a 128 × 128 change tile; negative indexes are allowed. */
export type TileId = `${number}_${number}`

/** How a building pad or a road reshapes the ground around it. */
export interface GroundFit {
  mode: 'off' | 'raise' | 'lower' | 'both'
  blendMeters: number
}

/** The final ground baked at publish: Int16 centimetres, row-major from the south-west corner. */
export interface BakedTerrain {
  originLat: number
  originLng: number
  cols: number
  rows: number
  cellMeters: 1
  /** base64 of Int16 little-endian values, `cols * rows` of them. */
  heightsCm: string
  minM: number
  maxM: number
}
