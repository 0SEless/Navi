import { describe, expect, it } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { createHeightField, encodeTile, tileIdOf, TILE_CELLS, type CampusDocument, type CampusTerrain, type TerrainBaseSource, type TerrainGrid } from '@navi/core'
import { createTerrainPaintPreview } from '../terrain-preview'
import { ibajayDoc } from '../../../../packages/core/src/terrain/__tests__/ibajay-fixture'

type MiniMap = { fire(type: string): void; fireable(type: string): number; added: Array<{ layer: unknown; before?: unknown }> }
function fakeMap({ styleLoaded = true, pitch = 0, baseLayers = ['terrain-roads'] as string[] } = {}): maplibregl.Map & MiniMap {
  const singles = new Map<string, Array<(...a: unknown[]) => void>>()
  const place: Array<{ layer: unknown; before?: unknown }> = []
  const map = {
    addLayer: (layer: unknown, before?: unknown) => place.push({ layer, before }),
    getLayer: (id: string) => (baseLayers.includes(id) ? {} : undefined),
    removeLayer: () => {},
    isStyleLoaded: () => styleLoaded,
    once: (type: string, fn: (...a: unknown[]) => void) => {
      const list = (singles.get(type) ?? []).concat(fn)
      singles.set(type, list)
    },
    off: (type: string, fn: (...a: unknown[]) => void) => {
      singles.set(type, (singles.get(type) ?? []).filter((f) => f !== fn))
    },
    on: (type: string, fn: (...a: unknown[]) => void) => {
      singles.set(type, (singles.get(type) ?? []).concat(fn))
    },
    getPitch: () => pitch,
    getCanvas: () => ({ clientWidth: 400, clientHeight: 300 }),
    triggerRepaint: () => {},
    fire(type: string) {
      for (const fn of [...(singles.get(type) ?? [])]) fn()
    },
    fireable(type: string) {
      return (singles.get(type) ?? []).length
    },
  } as unknown as maplibregl.Map & MiniMap
  const attached = map
  attached.added = place
  return attached
}

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => ({ lat: grid.originLat + y / 110540, lng: grid.originLng + x / (111320 * Math.cos((11.8 * Math.PI) / 180)) })
function planeBase(a: number, b: number): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, a + b * x]
  }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}
function documentOf(terrain?: CampusTerrain): CampusDocument {
  return { schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], ...(terrain ? { terrain } : {}) } as unknown as CampusDocument
}
function workingTile(cells: number[]): Int16Array {
  const out = new Int16Array(TILE_CELLS * TILE_CELLS)
  out.set(cells.slice(0, Math.min(cells.length, out.length)))
  return out
}

describe('TerrainPaintPreview', () => {
  it('adds one preview layer per map on stroke start, above the overlays', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap()
    const mini = fakeMap({ pitch: 55 })
    preview.setMaps([top, mini], 2)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([100, 120])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    expect(top.added).toHaveLength(1)
    expect(mini.added).toHaveLength(1)
    expect(top.added[0].before).toBe('terrain-roads')
    const layerTop = preview.layerOn(top)
    expect(layerTop?.vertexCount()).toBeGreaterThan(0)
  })

  it('follows the stair-mesh vertical rule: exaggeration (clamped) when tilted, 0 when flat', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap()
    const mini = fakeMap({ pitch: 55 })
    preview.setMaps([top, mini], 3.5)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([120])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    expect(preview.layerOn(top)?.verticalScale()).toBe(0)
    expect(preview.layerOn(mini)?.verticalScale()).toBeCloseTo(3.5, 5)
  })

  it('update() grows the mesh when the stroke writes new cells', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap()
    preview.setMaps([top], 1)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([1])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    const before = preview.layerOn(top)!.vertexCount()
    tiles.set(tileIdOf(1, 0), workingTile([1, 2, 3]))
    preview.update()
    expect(preview.layerOn(top)!.vertexCount()).toBeGreaterThan(before)
  })

  it('commit clears when the maps go idle after the tile reload', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap()
    preview.setMaps([top], 1)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([1])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    expect(preview.layerOn(top)!.vertexCount()).toBeGreaterThan(0)
    preview.commit()
    top.fire('idle')
    expect(preview.layerOn(top)!.vertexCount()).toBe(0)
  })

  it('cancel clears at once and removes the pending idle clears', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap()
    preview.setMaps([top], 1)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([1])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    preview.commit()
    preview.cancel()
    expect(preview.layerOn(top)!.vertexCount()).toBe(0)
    expect(top.fireable('idle')).toBe(0)
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    expect(preview.layerOn(top)!.vertexCount()).toBeGreaterThan(0)
    top.fire('idle')
    expect(preview.layerOn(top)!.vertexCount()).toBeGreaterThan(0)
  })

  it('a map whose style loaded while tiles (the street map) are still coming attaches at once', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap({ styleLoaded: false })
    ;(top as unknown as { style: { _loaded: boolean } }).style = { _loaded: true }
    preview.setMaps([top], 1)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([1])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    expect(top.added).toHaveLength(1)
  })

  it('a map without the style loaded attaches on style.load and paints then', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap({ styleLoaded: false })
    preview.setMaps([top], 1)
    const tiles = new Map([[tileIdOf(0, 0), workingTile([1])]])
    preview.start(documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), tiles)
    expect(top.added).toHaveLength(0)
    top.fire('style.load')
    expect(top.added).toHaveLength(1)
    expect(preview.layerOn(top)!.vertexCount()).toBeGreaterThan(0)
  })

  it('draws only the cells this stroke changes, not earlier changes in the same tile (no flicker over unchanged ground)', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap({ pitch: 55 })
    preview.setMaps([top], 1)
    // The tile already holds an earlier change in its first cell; the stroke adds one far away.
    const committed = workingTile([300])
    const working = committed.slice()
    working[100 * TILE_CELLS + 100] = 50
    const document = { ...documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, base: planeBase(0, 0), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain), terrainTiles: { [tileIdOf(0, 0)]: encodeTile(committed) } } as unknown as CampusDocument
    preview.start(document, new Map([[tileIdOf(0, 0), working]]))
    const vertices = preview.layerOn(top)!.vertexCount()
    expect(vertices).toBeGreaterThan(0)
    // At most the 2 x 2 cells around the one changed cell (6 vertices per cell), not the 101 x 101 box.
    expect(vertices).toBeLessThanOrEqual(4 * 6)
  })

  it('a document without terrain attaches nothing', () => {
    const preview = createTerrainPaintPreview()
    const top = fakeMap()
    preview.setMaps([top], 1)
    preview.start(documentOf(), new Map())
    expect(preview.layerOn(top)).toBeNull()
  })
})

// Smooth sculpting (2026-11-07): with the height field, the preview is 32 m chunks and a frame rebuilds only the
// chunks its brush rectangle touched.
describe('TerrainPaintPreview chunks (height field)', () => {
  const box = (x: number, y: number) => ({ minX: x - 3, minY: y - 3, maxX: x + 3, maxY: y + 3 })
  const flatCampus = (): CampusDocument =>
    ({
      ...documentOf({ reference: { name: 'T', zeroMeaning: 'Sea level' }, grid, colorRange: { minM: 0, maxM: 40 } } as CampusTerrain),
      boundary: { points: [ll(20, 20), ll(140, 20), ll(140, 140), ll(20, 140)] },
    }) as unknown as CampusDocument
  function stroke() {
    const doc = flatCampus()
    const field = createHeightField(doc)!
    const tile = new Int16Array(TILE_CELLS * TILE_CELLS)
    const tiles = new Map([[tileIdOf(0, 0), tile]])
    const preview = createTerrainPaintPreview()
    const map = fakeMap()
    preview.setMaps([map], 1)
    preview.start(doc, tiles, field)
    return { preview, map, field, tile }
  }

  it('one frame rebuilds only touched chunks', () => {
    const { preview, tile } = stroke()
    tile[40 * TILE_CELLS + 40] = 200
    preview.update(box(40, 40))
    expect(preview.chunkKeys()).toEqual(['1_1'])
    const first = preview.chunk('1_1')
    tile[40 * TILE_CELLS + 100] = 200
    preview.update(box(100, 40))
    expect(preview.chunkKeys().sort()).toEqual(['1_1', '3_1'])
    expect(preview.chunk('1_1')).toBe(first) // untouched this frame: not rebuilt
  })

  it('cells unchanged since the stroke start are not drawn', () => {
    const { preview, map, tile } = stroke()
    tile[40 * TILE_CELLS + 40] = 200
    preview.update(box(40, 40))
    // Only the four 1 m cells sharing the raised corner: 4 cells × 2 triangles × 3 vertices.
    expect(preview.layerOn(map)?.vertexCount()).toBe(24)
  })

  it('cancel clears all chunks and puts the ground back in the field', () => {
    const { preview, map, field, tile } = stroke()
    tile[40 * TILE_CELLS + 40] = 200
    preview.update(box(40, 40))
    expect(field.heightAt(40, 40)).toBeCloseTo(2, 6)
    preview.cancel()
    expect(preview.chunkKeys()).toEqual([])
    expect(preview.layerOn(map)?.vertexCount()).toBe(0)
    expect(field.heightAt(40, 40)).toBe(0)
  })
})

const perf = process.env.PERF ? describe : describe.skip
perf('TerrainPaintPreview speed (PERF=1, ASU-IBAJAY copy)', () => {
  it('a 30 m brush frame rebuild takes ≤ 3 ms', () => {
    const doc = ibajayDoc()
    const field = createHeightField(doc)!
    const tiles = new Map([[tileIdOf(Math.floor(300 / TILE_CELLS), 0), new Int16Array(TILE_CELLS * TILE_CELLS)]])
    const preview = createTerrainPaintPreview()
    preview.setMaps([fakeMap()], 1)
    preview.start(doc, tiles, field)
    const rect = { minX: 285, minY: 105, maxX: 315, maxY: 135 }
    const tile = tiles.values().next().value!
    for (let i = 0; i < 5; i++) {
      tile[120 * TILE_CELLS + (300 % TILE_CELLS)] += 10
      preview.update(rect)
    }
    const t = performance.now()
    for (let i = 0; i < 20; i++) {
      tile[120 * TILE_CELLS + (300 % TILE_CELLS)] += 10
      preview.update(rect)
    }
    expect((performance.now() - t) / 20).toBeLessThanOrEqual(3)
  })
})
