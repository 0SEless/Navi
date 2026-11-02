import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Building } from '../../types/entities'
import { encodeTile, tileIdOf, toLatLng, TILE_CELLS, decodeInt16 } from '../grid'
import { createTerrainSampler, effectiveBuildingBase, followGroundBase, surfaceHeightAt } from '../compose'
import { bakeTerrain } from '../bake'
import { heightsColorStops, CHANGES_COLOR_STOPS } from '../color-scale'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

/** A plane h = a + b·x over [-200, 200]², as a two-triangle mesh. */
function planeBase(a: number, b: number): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, a + b * x]
  }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}

function terrainOf(base?: TerrainBaseSource): CampusTerrain {
  return { reference: { name: 'Test', zeroMeaning: 'Sea level' }, grid, ...(base ? { base } : {}), colorRange: { minM: 0, maxM: 40 } }
}

function rectFootprint(x0: number, y0: number, x1: number, y1: number) {
  return { points: [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)] }
}

function building(id: string, footprint: ReturnType<typeof rectFootprint>, extra: Partial<Building> = {}): Building {
  return { id, name: id, code: id, category: 'academic', description: '', footprint, baseElevation: 0, height: 10, floors: [], verticalConnectors: [], color: '#000', aliases: [], metadata: {}, ...extra } as unknown as Building
}

function doc(fields: Partial<CampusDocument>): CampusDocument {
  return { schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [], ...fields } as unknown as CampusDocument
}

describe('createTerrainSampler', () => {
  it('no terrain → createTerrainSampler returns null', () => {
    expect(createTerrainSampler(doc({}))).toBeNull()
  })

  it('base + one tile change', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS)
    cells[5 * TILE_CELLS + 5] = 150
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(planeBase(10, 0)), terrainTiles: { [tileIdOf(0, 0)]: encodeTile(cells) } }))!
    expect(sampler.heightAt(5, 5)).toBeCloseTo(11.5, 6)
    expect(sampler.changeAt(5.5, 5)).toBeCloseTo(0.75, 6)
  })

  it('absent tile means no change', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(planeBase(10, 0)) }))!
    expect(sampler.changeAt(-300, 900)).toBe(0)
    expect(sampler.heightAt(3, 3)).toBeCloseTo(10, 6)
  })

  it('no base means 0 m ground', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf() }))!
    expect(sampler.heightAt(1, 1)).toBe(0)
  })
})

describe('fits', () => {
  const slope = planeBase(0, 0.5) // 0 m at x=0 → 10 m at x=20
  const pad = (mode: 'both' | 'raise' | 'lower') => building('b1', rectFootprint(0, 0, 20, 10), { ground: { baseMode: 'follow-ground', pad: { mode, blendMeters: 3 } } })

  it('followGroundBase is the mean over the outline', () => {
    const b = pad('both')
    expect(followGroundBase(b, (x) => 0.5 * x, grid)).toBeCloseTo(5, 6)
  })

  it('pad both flattens the outline to the base', () => {
    const d = doc({ terrain: terrainOf(slope), buildings: [pad('both')] })
    const sampler = createTerrainSampler(d)!
    expect(effectiveBuildingBase(d.buildings[0], sampler, grid)).toBeCloseTo(5, 6)
    for (const [x, y] of [[0, 0], [20, 0], [20, 10], [0, 10], [10, 5]]) expect(sampler.heightAt(x, y)).toBeCloseTo(5, 2)
  })

  it('pad blend reaches ground at 3 m', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(slope), buildings: [pad('both')] }))!
    expect(sampler.heightAt(23, 5)).toBeCloseTo(11.5, 6)
    const mid = sampler.heightAt(21.5, 5)
    expect(mid).toBeGreaterThan(5)
    expect(mid).toBeLessThan(10.75)
  })

  it('pad raise leaves higher ground untouched', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(slope), buildings: [pad('raise')] }))!
    expect(sampler.heightAt(15, 5)).toBeCloseTo(7.5, 6)
    expect(sampler.heightAt(2, 5)).toBeCloseTo(5, 6)
  })

  it('a fixed building without a pad does not change the ground', () => {
    const sampler = createTerrainSampler(doc({ terrain: terrainOf(slope), buildings: [building('b2', rectFootprint(0, 0, 20, 10), { baseElevation: 3 })] }))!
    expect(sampler.heightAt(15, 5)).toBeCloseTo(7.5, 6)
  })
})

describe('surfaceHeightAt', () => {
  it('reads the top of a stair over the ground', () => {
    const d = doc({
      terrain: terrainOf(planeBase(2, 0)),
      structures: [{
        id: 's1', form: 'ramp', presetId: 'p', width: 2, underneath: 'open', railings: 'none',
        start: { kind: 'ground', position: ll(0, 0) }, end: { kind: 'ground', position: ll(20, 0) },
        heightOverride: { start: 12, end: 2 },
      }],
    })
    const sampler = createTerrainSampler(d)!
    expect(surfaceHeightAt(d, sampler, ll(10, 0))).toBeCloseTo(7, 3)
    expect(surfaceHeightAt(d, sampler, ll(10, 5))).toBeCloseTo(2, 6)
  })
})

describe('bakeTerrain', () => {
  it('bake covers boundary bbox + 20 m', () => {
    const baked = bakeTerrain(doc({ terrain: terrainOf(planeBase(10, 0)), boundary: { points: [ll(0, 0), ll(30, 0), ll(30, 10), ll(0, 10)] } }))!
    expect(baked.cols).toBe(71)
    expect(baked.rows).toBe(51)
    const sw = toLatLng(grid, { x: -20, y: -20 })
    expect(baked.originLat).toBeCloseTo(sw.lat, 7)
    expect(baked.originLng).toBeCloseTo(sw.lng, 7)
  })

  it('bake encodes heights in cm row-major from south-west', () => {
    const baked = bakeTerrain(doc({ terrain: terrainOf(planeBase(1, 0.1)), boundary: { points: [ll(0, 0), ll(30, 0), ll(30, 10), ll(0, 10)] } }))!
    const cells = decodeInt16(baked.heightsCm)
    expect(cells.length).toBe(baked.cols * baked.rows)
    expect(cells[0]).toBe(-100) // x = -20 → 1 + 0.1·(−20) = −1 m
    expect(cells[1]).toBe(-90)
    expect(cells[baked.cols]).toBe(-100) // one row north, same x
    expect(baked.minM).toBeCloseTo(-1, 6)
    expect(baked.maxM).toBeCloseTo(6, 6)
  })

  it('no terrain or no boundary → null', () => {
    expect(bakeTerrain(doc({ boundary: { points: [ll(0, 0), ll(1, 0), ll(1, 1)] } }))).toBeNull()
    expect(bakeTerrain(doc({ terrain: terrainOf() }))).toBeNull()
  })
})

describe('color scale', () => {
  it('heightsColorStops spans the campus range', () => {
    expect(heightsColorStops(0, 40)).toEqual([[0, '#22c55e'], [20, '#eab308'], [40, '#ef4444']])
    expect(heightsColorStops(5, 5)).toEqual([[5, '#22c55e'], [5.5, '#eab308'], [6, '#ef4444']])
    expect(CHANGES_COLOR_STOPS).toEqual([[-5, '#1d4ed8'], [-0.3, '#93c5fd'], [-0.1, 'rgba(0,0,0,0)'], [0.1, 'rgba(0,0,0,0)'], [0.3, '#fca5a5'], [5, '#dc2626']])
  })
})
