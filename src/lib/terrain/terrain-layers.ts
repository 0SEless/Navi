import { HILLSHADE_LAYER } from './terrain-view'

/** What the terrain editor shows (section 5). Remembered per browser. */
export interface TerrainLayers {
  streetMap: boolean
  streetMapOpacity: number
  ground: boolean
  groundOpacity: number
  contours: boolean
  buildings: boolean
  roads: boolean
  structures: boolean
  boundary: boolean
  tracing: boolean
}

export const DEFAULT_LAYERS: TerrainLayers = {
  streetMap: true, streetMapOpacity: 1, ground: true, groundOpacity: 0.5, contours: true,
  buildings: true, roads: true, structures: true, boundary: true, tracing: true,
}

export const STREET_MAP_SOURCE = 'terrain-street-map'
export const STREET_MAP_LAYER = 'terrain-street-map'
export const STREET_MAP_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const STORAGE_KEY = 'navi-terrain-layers'

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Stored choices over the defaults; anything unreadable falls back to the default. */
export function loadLayers(storage: Storage | null = browserStorage()): TerrainLayers {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LAYERS }
    const stored = JSON.parse(raw) as Record<string, unknown>
    const layers = { ...DEFAULT_LAYERS }
    for (const key of Object.keys(DEFAULT_LAYERS) as Array<keyof TerrainLayers>) {
      const value = stored[key]
      if (typeof DEFAULT_LAYERS[key] === 'boolean' && typeof value === 'boolean') (layers[key] as boolean) = value
      if (typeof DEFAULT_LAYERS[key] === 'number' && typeof value === 'number' && value >= 0 && value <= 1) (layers[key] as number) = value
    }
    return layers
  } catch {
    return { ...DEFAULT_LAYERS }
  }
}

export function saveLayers(layers: TerrainLayers, storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(layers))
  } catch {
    // Private windows and blocked storage: the choice lasts until the page closes.
  }
}

/** Visibility of the map layers these switches own (buildings, roads and contours keep their own handling). */
export function layerVisibility(layers: TerrainLayers): Record<string, 'visible' | 'none'> {
  const show = (on: boolean) => (on ? 'visible' : 'none') as 'visible' | 'none'
  return {
    [STREET_MAP_LAYER]: show(layers.streetMap),
    'terrain-background': show(layers.ground),
    [HILLSHADE_LAYER]: show(layers.ground),
    'terrain-boundary': show(layers.boundary),
    'terrain-structures': show(layers.structures),
  }
}
