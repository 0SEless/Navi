import { describe, expect, it } from 'vitest'
import { applyTerrainView, overlayAnchor, RELIEF_LAYER, ROAD_SURFACE_LAYER, TRACING_LAYER } from '../terrain-view'

/** A map that keeps its layers in drawing order (first = bottom). */
function orderedMap(ids: string[]) {
  const layers = ids.map((id) => ({ id }))
  return {
    ids: () => layers.map((l) => l.id),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (layer: Record<string, unknown>, before?: string) => {
      const at = before ? layers.findIndex((l) => l.id === before) : -1
      layers.splice(at < 0 ? layers.length : at, 0, { id: layer.id as string })
    },
    removeLayer: (id: string) => { layers.splice(layers.findIndex((l) => l.id === id), 1) },
    setTerrain: () => {},
  }
}

describe('terrain layer order', () => {
  it('the height colours go under the road surfaces, not over them', () => {
    const map = orderedMap(['terrain-hillshade', ROAD_SURFACE_LAYER, 'terrain-roads'])
    applyTerrainView(map, { view: 'heights', colorRange: { minM: 0, maxM: 40 }, exaggeration: 1 })
    expect(map.ids()).toEqual(['terrain-hillshade', RELIEF_LAYER, ROAD_SURFACE_LAYER, 'terrain-roads'])
  })

  it('with a tracing image: colours, tracing image, road surfaces, road lines', () => {
    const map = orderedMap(['terrain-hillshade', ROAD_SURFACE_LAYER, 'terrain-roads'])
    map.addLayer({ id: TRACING_LAYER }, overlayAnchor(map))
    applyTerrainView(map, { view: 'changes', colorRange: { minM: 0, maxM: 40 }, exaggeration: 1 })
    expect(map.ids()).toEqual(['terrain-hillshade', RELIEF_LAYER, TRACING_LAYER, ROAD_SURFACE_LAYER, 'terrain-roads'])
  })
})
