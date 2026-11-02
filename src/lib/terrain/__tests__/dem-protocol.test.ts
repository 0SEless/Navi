import { describe, expect, it } from 'vitest'
import { decodeDemPixel, encodeDemTile } from '../dem-protocol'
import { applyTerrainView, TERRAIN_SOURCE, CHANGES_SOURCE, RELIEF_LAYER, RELIEF_SOURCE, CONTOUR_LAYER, type TerrainMapLike } from '../terrain-view'

describe('encodeDemTile', () => {
  it('a constant 12.34 m tile decodes to 12.3 everywhere', () => {
    const pixels = encodeDemTile(16, 0, 0, () => 12.34, 8)
    expect(pixels.length).toBe(8 * 8 * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      expect(decodeDemPixel(pixels[i], pixels[i + 1], pixels[i + 2])).toBeCloseTo(12.3, 1)
      expect(pixels[i + 3]).toBe(255)
    }
  })

  it('-10 m decodes back', () => {
    const pixels = encodeDemTile(16, 0, 0, () => -10, 4)
    expect(decodeDemPixel(pixels[0], pixels[1], pixels[2])).toBeCloseTo(-10, 1)
  })

  it('samples at pixel centres of the tile', () => {
    const seen: Array<{ lat: number; lng: number }> = []
    encodeDemTile(1, 1, 0, (lat, lng) => {
      seen.push({ lat, lng })
      return 0
    }, 2)
    expect(seen[0].lng).toBeCloseTo(45, 6) // tile x=1 of 2 at z1 spans lng 0..180; first centre at 45
    expect(seen[0].lat).toBeGreaterThan(0)
  })
})

function fakeMap(): TerrainMapLike & { layers: Map<string, Record<string, unknown>>; terrain: unknown } {
  const layers = new Map<string, Record<string, unknown>>()
  const map = {
    layers,
    terrain: null as unknown,
    getLayer: (id: string) => layers.get(id),
    addLayer: (layer: Record<string, unknown>) => { layers.set(layer.id as string, layer) },
    removeLayer: (id: string) => { layers.delete(id) },
    setTerrain: (terrain: unknown) => { map.terrain = terrain },
  }
  return map
}

describe('applyTerrainView', () => {
  it('Heights view adds color-relief with heightsColorStops', () => {
    const map = fakeMap()
    applyTerrainView(map, { view: 'heights', colorRange: { minM: 0, maxM: 40 }, exaggeration: 1 })
    const relief = map.layers.get(RELIEF_LAYER)!
    expect(relief.type).toBe('color-relief')
    expect(relief.source).toBe(RELIEF_SOURCE)
    expect(relief.paint).toEqual({ 'color-relief-color': ['interpolate', ['linear'], ['elevation'], 0, '#22c55e', 20, '#eab308', 40, '#ef4444'], 'color-relief-opacity': 0.55 })
    expect(map.layers.has(CONTOUR_LAYER)).toBe(false)
  })

  it('Changes view switches the relief source', () => {
    const map = fakeMap()
    applyTerrainView(map, { view: 'heights', colorRange: { minM: 0, maxM: 40 }, exaggeration: 1 })
    applyTerrainView(map, { view: 'changes', colorRange: { minM: 0, maxM: 40 }, exaggeration: 1 })
    const relief = map.layers.get(RELIEF_LAYER)!
    expect(relief.source).toBe(CHANGES_SOURCE)
    expect((relief.paint as Record<string, unknown[]>)['color-relief-color']).toEqual(['interpolate', ['linear'], ['elevation'], -5, '#1d4ed8', -0.3, '#93c5fd', -0.1, 'rgba(0,0,0,0)', 0.1, 'rgba(0,0,0,0)', 0.3, '#fca5a5', 5, '#dc2626'])
  })

  it('Contours view shows the contour lines without relief colours', () => {
    const map = fakeMap()
    applyTerrainView(map, { view: 'contours', colorRange: { minM: 0, maxM: 40 }, exaggeration: 1 })
    expect(map.layers.has(CONTOUR_LAYER)).toBe(true)
    expect(map.layers.has(RELIEF_LAYER)).toBe(false)
  })

  it('exaggeration slider sets terrain exaggeration', () => {
    const map = fakeMap()
    applyTerrainView(map, { view: 'heights', colorRange: { minM: 0, maxM: 40 }, exaggeration: 3 })
    expect(map.terrain).toEqual({ source: TERRAIN_SOURCE, exaggeration: 3 })
    applyTerrainView(map, { view: 'heights', colorRange: { minM: 0, maxM: 40 }, exaggeration: 9 })
    expect(map.terrain).toEqual({ source: TERRAIN_SOURCE, exaggeration: 5 })
  })

  it('the flat top view has no 3D terrain', () => {
    const map = fakeMap()
    applyTerrainView(map, { view: 'heights', colorRange: { minM: 0, maxM: 40 }, exaggeration: 3, threeD: false })
    expect(map.terrain).toBeNull()
  })
})

describe('TerrainTileCache', () => {
  it('keeps tiles until an overlapping area is invalidated', async () => {
    const { TerrainTileCache, demTileBounds } = await import('../dem-protocol')
    const cache = new TerrainTileCache()
    const a = new ArrayBuffer(4)
    cache.set('navi-terrain', 16, 54000, 30000, a)
    expect(cache.get('navi-terrain', 16, 54000, 30000)).not.toBeNull()
    const bounds = demTileBounds(16, 54000, 30000)
    cache.invalidate({ west: bounds.east + 0.01, east: bounds.east + 0.02, south: bounds.south, north: bounds.north })
    expect(cache.get('navi-terrain', 16, 54000, 30000)).not.toBeNull()
    cache.invalidate({ west: bounds.west, east: bounds.west + 1e-6, south: bounds.south, north: bounds.south + 1e-6 })
    expect(cache.get('navi-terrain', 16, 54000, 30000)).toBeNull()
  })

  it('invalidate all clears every tile; get returns a copy', async () => {
    const { TerrainTileCache } = await import('../dem-protocol')
    const cache = new TerrainTileCache()
    const data = new Uint8Array([1, 2, 3]).buffer
    cache.set('s', 1, 0, 0, data)
    const copy = cache.get('s', 1, 0, 0)!
    expect(copy).not.toBe(data)
    expect(new Uint8Array(copy)).toEqual(new Uint8Array([1, 2, 3]))
    cache.invalidate('all')
    expect(cache.get('s', 1, 0, 0)).toBeNull()
  })
})

describe('TerrainTileCache epochs', () => {
  it('a tile generated across an invalidate is not cached', async () => {
    const { TerrainTileCache } = await import('../dem-protocol')
    const cache = new TerrainTileCache()
    const startedAt = cache.epoch
    cache.invalidate('all')
    cache.set('s', 1, 0, 0, new ArrayBuffer(2), startedAt)
    expect(cache.get('s', 1, 0, 0)).toBeNull()
  })
})

describe('NO_AREA', () => {
  it('invalidates nothing', async () => {
    const { TerrainTileCache } = await import('../dem-protocol')
    const { NO_AREA } = await import('../use-terrain-sampler')
    const cache = new TerrainTileCache()
    cache.set('s', 1, 0, 0, new ArrayBuffer(2))
    cache.set('s', 1, 1, 1, new ArrayBuffer(2))
    cache.invalidate(NO_AREA)
    expect(cache.get('s', 1, 0, 0)).not.toBeNull()
    expect(cache.get('s', 1, 1, 1)).not.toBeNull()
  })
})
