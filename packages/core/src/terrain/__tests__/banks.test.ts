import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Road } from '../../types/entities'
import { toLatLng } from '../grid'
import { createTerrainSampler } from '../compose'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

// Owner 2026-11-15: banks and plinths. A hill rising 0.25 m per metre to the north (+y); a 20 m square
// building (x 40–60, y 40–60) with its floor at 12.5 m; the hill is 15 m at its north wall, 10 m at its south.
const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
function base(slope = 0.25): TerrainBaseSource {
  const vertices: Array<[number, number, number]> = []
  const triangles: Array<[number, number, number]> = []
  const n = 30
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -20 + (160 * i) / n
    const y = -20 + (160 * j) / n
    const p = ll(x, y)
    vertices.push([p.lat, p.lng, slope * y])
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i
    triangles.push([a, a + 1, a + n + 2], [a, a + n + 2, a + n + 1])
  }
  return { kind: 'mesh', vertices, triangles, sourceNote: 'test' }
}
const building = (id: string, x0: number, around?: string, bankSlope?: string, floor = 12.5) => ({
  id, name: id, footprint: { points: [ll(x0, 40), ll(x0 + 20, 40), ll(x0 + 20, 60), ll(x0, 60), ll(x0, 40)] }, baseElevation: floor,
  ground: { baseMode: 'fixed', pad: { mode: 'both', blendMeters: 3 }, ...(around ? { around } : {}), ...(bankSlope ? { bankSlope } : {}) },
  floors: [], metadata: {},
})
function sampler(buildings: unknown[], opts: { slope?: number; roads?: Road[] } = {}) {
  return createTerrainSampler({
    schemaVersion: 1, version: 0, metadata: {}, buildings, roads: opts.roads ?? [], panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: base(opts.slope), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain,
  } as unknown as CampusDocument)!
}

describe('banks and plinths', () => {
  it('inside the outline the ground is at the floor', () => {
    expect(sampler([building('a', 40)]).heightAt(50, 50)).toBeCloseTo(12.5, 6)
  })

  it('uphill: a 1 m walkway, then a bank at 1 in 2 until it meets the hill', () => {
    const s = sampler([building('a', 40)])
    expect(s.heightAt(50, 60.5)).toBeCloseTo(12.5, 2)
    expect(s.heightAt(50, 65)).toBeCloseTo(12.5 + 0.5 * 4, 2)
    expect(s.heightAt(50, 80)).toBeCloseTo(s.groundAt(50, 80), 6)
  })

  it('bank slope: steep reaches the hill sooner, gentle cuts deeper', () => {
    expect(sampler([building('a', 40, 'bank', 'steep')]).heightAt(50, 65)).toBeCloseTo(16.25, 2)
    expect(sampler([building('a', 40, 'bank', 'gentle')]).heightAt(50, 65)).toBeCloseTo(12.5 + 4 / 3, 2)
  })

  it('downhill: Bank and plinth leaves the hill; Slopes all round fills up to it', () => {
    const bank = sampler([building('a', 40)])
    expect(bank.heightAt(50, 35)).toBeCloseTo(bank.groundAt(50, 35), 6)
    expect(sampler([building('a', 40, 'slopes')]).heightAt(50, 35)).toBeCloseTo(12.5 - 0.5 * 4, 2)
  })

  it('Leave the hill: nothing outside the outline changes', () => {
    const s = sampler([building('a', 40, 'leave')])
    expect(s.heightAt(50, 65)).toBeCloseTo(s.groundAt(50, 65), 6)
    expect(s.heightAt(50, 50)).toBeCloseTo(12.5, 6)
  })

  it('two buildings 6 m apart: no step between their banks', () => {
    const s = sampler([building('a', 40), building('b', 66)])
    for (const y of [62, 66]) for (let x = 50; x < 76; x++) expect(Math.abs(s.heightAt(x + 1, y) - s.heightAt(x, y))).toBeLessThan(0.51)
  })

  it('flat ground at floor height: nothing changes outside', () => {
    const s = sampler([building('a', 40, undefined, undefined, 0)], { slope: 0 })
    for (const [x, y] of [[50, 62], [50, 38], [62, 50]]) expect(s.heightAt(x, y)).toBeCloseTo(0, 6)
  })

  it('a graded road through the bank stays level across', () => {
    const road = {
      id: 'r', name: 'r', polyline: { points: [ll(20, 64), ll(80, 64)] }, width: 6, surface: 'asphalt', type: 'connector', metadata: {},
      groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 1 },
    } as unknown as Road
    const s = sampler([building('a', 40)], { roads: [road] })
    for (const x of [45, 50, 55]) expect(s.heightAt(x, 61.5)).toBeCloseTo(s.heightAt(x, 66.5), 1)
  })
})
