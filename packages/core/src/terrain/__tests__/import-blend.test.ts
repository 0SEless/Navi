import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import { lowestBaseInside } from '../base-surface'
import { bakeTerrain } from '../bake'
import { createTerrainSampler } from '../compose'
import { decodeInt16, toLatLng } from '../grid'
import type { TerrainBaseSource, TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
/** h = 20 + 0.1 · x over [-300, 300]² (an imported ground: 20 m at the campus's west edge). */
const v = (x: number, y: number): [number, number, number] => { const p = ll(x, y); return [p.lat, p.lng, 20 + 0.1 * x] }
const base: TerrainBaseSource = { kind: 'mesh', vertices: [v(-300, -300), v(300, -300), v(300, 300), v(-300, 300)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
const square = [ll(0, 0), ll(100, 0), ll(100, 100), ll(0, 100)]

function doc(blend?: { zeroM: number; edgeM: number }, boundary = true): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    ...(boundary ? { boundary: { points: square } } : {}),
    terrain: { reference: { name: 'x', zeroMeaning: 'y' }, grid, base, colorRange: { minM: 0, maxM: 40 }, ...(blend ? { importBlend: blend } : {}) },
  } as unknown as CampusDocument
}

describe('blended import (importBlend)', () => {
  it('inside the boundary heights shift by zeroM and keep their slopes', () => {
    const s = createTerrainSampler(doc({ zeroM: 20, edgeM: 40 }))!
    expect(s.heightAt(50, 50)).toBeCloseTo(5, 6)
    expect(s.heightAt(90, 50) - s.heightAt(10, 50)).toBeCloseTo(8, 6)
  })

  it('edgeM outside the boundary the ground is 0 m', () => {
    const s = createTerrainSampler(doc({ zeroM: 20, edgeM: 40 }))!
    expect(s.heightAt(140, 50)).toBeCloseTo(0, 6)
    expect(s.heightAt(200, 50)).toBeCloseTo(0, 6)
    expect(s.heightAt(50, -60)).toBeCloseTo(0, 6)
  })

  it('half way out it is smoothstep-blended', () => {
    const s = createTerrainSampler(doc({ zeroM: 20, edgeM: 40 }))!
    // x = 120: 20 m outside (t = 0.5, smoothstep 0.5); the shifted base there is 32 − 20 = 12 m.
    expect(s.heightAt(120, 50)).toBeCloseTo(6, 6)
  })

  it('no importBlend, or no boundary: heights are unchanged', () => {
    expect(createTerrainSampler(doc())!.heightAt(50, 50)).toBeCloseTo(25, 6)
    expect(createTerrainSampler(doc({ zeroM: 20, edgeM: 40 }, false))!.heightAt(50, 50)).toBeCloseTo(25, 6)
  })

  it('publishing (bake) uses the blend', () => {
    const baked = bakeTerrain(doc({ zeroM: 20, edgeM: 40 }))!
    const cells = decodeInt16(baked.heightsCm)
    // The baked grid starts 20 m south-west of the boundary; the campus centre (50, 50) is cell (70, 70): 5 m.
    expect(cells[70 * baked.cols + 70]).toBe(500)
    // West of the campus the import keeps descending and eases toward 0 m: shallow, never the 20 m it was.
    expect(baked.minM).toBeGreaterThan(-2.1)
    expect(baked.maxM).toBeLessThan(15)
  })

  it('lowestBaseInside finds the lowest imported ground inside the boundary', () => {
    const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    expect(lowestBaseInside(base, grid, ring)).toBeCloseTo(20, 0)
    expect(lowestBaseInside(base, grid, [])).toBeNull()
  })
})
