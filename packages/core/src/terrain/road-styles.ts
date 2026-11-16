/**
 * Road designs for NAVI Web (owner 2026-11-14): the admin picks one in Studio and it is saved with the campus.
 * `walkway` (Campus walkway, owner 2026-11-17) is the default; `standard` is the original look. Colours for roads and paths, and the white/yellow markings (null = none).
 */
export const ROAD_STYLES = ['walkway', 'standard', 'campus', 'night', 'brick', 'minimal'] as const
export type RoadStyleName = (typeof ROAD_STYLES)[number]
export const DEFAULT_ROAD_STYLE: RoadStyleName = 'walkway'

export interface RoadStyleSpec {
  label: string
  /** Vehicle roads. */
  road: string
  /** Footpaths (`pedestrian`). */
  path: string
  /** Edge lines along both sides of a footpath; null = none. */
  pathEdge: string | null
  /** Edge lines along both sides; null = none. */
  edge: string | null
  /** Centre line on two-lane roads; null = none. */
  centre: string | null
  /** Dash pattern of the centre line; null = solid. */
  centreDash: [number, number] | null
}

const SPECS: Record<RoadStyleName, RoadStyleSpec> = {
  // Footpaths read as warm paved walkways; vehicle roads a quiet grey with only a thin centre line.
  walkway: { label: 'Campus walkway', road: '#8a8f96', path: '#efe6d6', pathEdge: '#c9b79a', edge: null, centre: '#f2c94c', centreDash: null },
  standard: { label: 'Standard', road: '#4b4f55', path: '#ddd6c8', pathEdge: null, edge: '#ffffff', centre: '#ffffff', centreDash: [4, 4] },
  campus: { label: 'Campus drive', road: '#8a8f96', path: '#e8e2d4', pathEdge: null, edge: null, centre: '#f2c94c', centreDash: null },
  night: { label: 'Night', road: '#2c3036', path: '#c9c2b4', pathEdge: null, edge: '#f5f5f5', centre: '#facc15', centreDash: [3, 3] },
  brick: { label: 'Brick paving', road: '#a5654c', path: '#d9b99b', pathEdge: null, edge: null, centre: null, centreDash: null },
  minimal: { label: 'Minimal', road: '#b9bdc3', path: '#e7e8ea', pathEdge: null, edge: null, centre: null, centreDash: null },
}

export function isRoadStyle(value: unknown): value is RoadStyleName {
  return typeof value === 'string' && (ROAD_STYLES as readonly string[]).includes(value)
}

export function roadStyleSpec(style: RoadStyleName): RoadStyleSpec {
  return SPECS[isRoadStyle(style) ? style : DEFAULT_ROAD_STYLE]
}
