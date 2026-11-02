import { CHANGES_COLOR_STOPS, heightsColorStops } from '@navi/core'

export const TERRAIN_SOURCE = 'terrain-dem'
/** Heights for the colour layer: kept apart from the 3D terrain source (MapLibre renders both better). */
export const RELIEF_SOURCE = 'terrain-relief-dem'
export const CHANGES_SOURCE = 'terrain-changes'
export const CONTOUR_SOURCE = 'terrain-contours'
export const HILLSHADE_LAYER = 'terrain-hillshade'
export const RELIEF_LAYER = 'terrain-relief'
export const CONTOUR_LAYER = 'terrain-contours'

export type TerrainView = 'heights' | 'changes' | 'contours'

/** The few MapLibre calls the view switch needs (a fake implements them in tests). */
export interface TerrainMapLike {
  getLayer(id: string): unknown
  addLayer(layer: Record<string, unknown>): void
  removeLayer(id: string): void
  setTerrain(terrain: { source: string; exaggeration: number } | null): void
}

function reliefColor(stops: Array<[number, string]>): unknown[] {
  return ['interpolate', ['linear'], ['elevation'], ...stops.flat()]
}

function replaceLayer(map: TerrainMapLike, layer: Record<string, unknown>): void {
  if (map.getLayer(layer.id as string)) map.removeLayer(layer.id as string)
  map.addLayer(layer)
}

function removeIfPresent(map: TerrainMapLike, id: string): void {
  if (map.getLayer(id)) map.removeLayer(id)
}

/**
 * Heights: colour by height (campus range). Changes: colour by raise/lower (±5 m). Contours: lines only
 * (every 1 m, stronger every 5 m; no text labels: they would need a font server).
 * Hillshade stays in every view; exaggeration is clamped to 1–5; the top view (threeD false) has no 3D terrain.
 */
export function applyTerrainView(map: TerrainMapLike, opts: { view: TerrainView; colorRange: { minM: number; maxM: number }; exaggeration: number; threeD?: boolean }): void {
  const exaggeration = Math.min(5, Math.max(1, opts.exaggeration))
  // The top view is flat: 3D terrain there only costs tile loading.
  map.setTerrain(opts.threeD === false ? null : { source: TERRAIN_SOURCE, exaggeration })
  if (opts.view === 'contours') {
    removeIfPresent(map, RELIEF_LAYER)
    if (!map.getLayer(CONTOUR_LAYER)) {
      map.addLayer({ id: CONTOUR_LAYER, type: 'line', source: CONTOUR_SOURCE, paint: { 'line-color': '#78350f', 'line-opacity': ['case', ['==', ['get', 'major'], true], 0.9, 0.45], 'line-width': ['case', ['==', ['get', 'major'], true], 1.4, 0.7] } })
    }
    return
  }
  removeIfPresent(map, CONTOUR_LAYER)
  const changes = opts.view === 'changes'
  replaceLayer(map, {
    id: RELIEF_LAYER,
    type: 'color-relief',
    source: changes ? CHANGES_SOURCE : RELIEF_SOURCE,
    paint: {
      'color-relief-color': reliefColor(changes ? CHANGES_COLOR_STOPS : heightsColorStops(opts.colorRange.minM, opts.colorRange.maxM)),
      'color-relief-opacity': 0.55,
    },
  })
}
