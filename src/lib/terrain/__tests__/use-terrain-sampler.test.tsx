import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { encodeTile, tileIdOf, TILE_CELLS, toLatLng, type CampusDocument, type TerrainGrid } from '@navi/core'

vi.mock('maplibre-gl', () => ({ default: { addProtocol: vi.fn(), removeProtocol: vi.fn() } }))

import { markTerrainDirty, NO_AREA, useTerrainSampler } from '../use-terrain-sampler'

afterEach(cleanup)

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

/** A flat campus (boundary 20..100 m) with change tiles. */
function doc(tiles?: Record<string, string>): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(20, 20), ll(100, 20), ll(100, 100), ll(20, 100)] },
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 40 } },
    ...(tiles ? { terrainTiles: tiles } : {}),
  } as unknown as CampusDocument
}

/** Tile 0_0 raised 2 m at the given cells. */
function raised(...cells: Array<[number, number]>): Record<string, string> {
  const t = new Int16Array(TILE_CELLS * TILE_CELLS)
  for (const [x, y] of cells) t[y * TILE_CELLS + x] = 200
  return { [tileIdOf(0, 0)]: encodeTile(t) }
}

const box = (x: number, y: number) => {
  const sw = ll(x - 3, y - 3)
  const ne = ll(x + 3, y + 3)
  return { west: sw.lng, east: ne.lng, south: sw.lat, north: ne.lat }
}

describe('useTerrainSampler reads the height field', () => {
  it('a marked tile change updates only its rectangle', () => {
    const { result, rerender } = renderHook(({ d, v }) => useTerrainSampler(d, v), { initialProps: { d: doc(), v: 0 } })
    expect(result.current.sampler!.heightAt(40, 40)).toBe(0)
    markTerrainDirty(box(40, 40))
    rerender({ d: doc(raised([40, 40], [80, 80])), v: 1 })
    expect(result.current.sampler!.heightAt(40, 40)).toBeCloseTo(2, 6)
    // (80, 80) changed too but was not marked: the field keeps its old value until it is.
    expect(result.current.sampler!.heightAt(80, 80)).toBe(0)
  })

  it('an unmarked change rebuilds everything', () => {
    const { result, rerender } = renderHook(({ d, v }) => useTerrainSampler(d, v), { initialProps: { d: doc(), v: 0 } })
    rerender({ d: doc(raised([40, 40], [80, 80])), v: 1 })
    expect(result.current.sampler!.heightAt(40, 40)).toBeCloseTo(2, 6)
    expect(result.current.sampler!.heightAt(80, 80)).toBeCloseTo(2, 6)
  })

  it('a stair-only change (NO_AREA) leaves the ground as it was', () => {
    const { result, rerender } = renderHook(({ d, v }) => useTerrainSampler(d, v), { initialProps: { d: doc(raised([40, 40])), v: 0 } })
    markTerrainDirty(NO_AREA)
    rerender({ d: doc(raised([40, 40])), v: 1 })
    expect(result.current.sampler!.heightAt(40, 40)).toBeCloseTo(2, 6)
  })

  it('undo of a stroke (the tile removed, its rectangle marked) restores the ground', () => {
    const { result, rerender } = renderHook(({ d, v }) => useTerrainSampler(d, v), { initialProps: { d: doc(), v: 0 } })
    markTerrainDirty(box(40, 40))
    rerender({ d: doc(raised([40, 40])), v: 1 })
    markTerrainDirty(box(40, 40))
    rerender({ d: doc(), v: 2 })
    expect(result.current.sampler!.heightAt(40, 40)).toBe(0)
  })
})
