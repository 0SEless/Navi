import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Road } from '../../types/entities'
import { toLatLng } from '../grid'
import { createTerrainSampler } from '../compose'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

// Owner 2026-11-15: a road cut into the hill showed a jagged wall beside it. The ground beside a fitted road
// now keeps a level shoulder (Edge width) and then banks back to the hill at 1 in 2, like buildings.
const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
function hill(): TerrainBaseSource {
  const vertices: Array<[number, number, number]> = []
  const triangles: Array<[number, number, number]> = []
  const n = 30
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -20 + (160 * i) / n
    const y = -20 + (160 * j) / n
    const p = ll(x, y)
    vertices.push([p.lat, p.lng, 0.3 * y])
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i
    triangles.push([a, a + 1, a + n + 2], [a, a + n + 2, a + n + 1])
  }
  return { kind: 'mesh', vertices, triangles, sourceNote: 'test' }
}
// A 6 m road along y = 50 (hill 15 m there), pinned down to 10 m: a 5 m cut.
const road = {
  id: 'r', name: 'r', polyline: { points: [ll(0, 50), ll(100, 50)] }, width: 6, surface: 'asphalt', type: 'connector', metadata: {},
  groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 1, pins: [{ alongM: 0, heightM: 10 }, { alongM: 100, heightM: 10 }] },
} as unknown as Road
const s = createTerrainSampler({
  schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [road], panoramas: [], qrCheckpoints: [],
  terrain: { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: hill(), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain,
} as unknown as CampusDocument)!

describe('banks beside a fitted road', () => {
  it('the road itself is level at its height', () => {
    for (const y of [47.5, 50, 52.5]) expect(s.heightAt(50, y)).toBeCloseTo(10, 1)
  })

  it('a level shoulder as wide as Edge width, then a 1-in-2 bank back to the hill: no wall', () => {
    expect(s.heightAt(50, 55)).toBeCloseTo(10, 1)
    expect(s.heightAt(50, 60)).toBeCloseTo(10 + 0.5 * 4, 1)
    for (let y = 53; y < 95; y++) expect(Math.abs(s.heightAt(50, y + 1) - s.heightAt(50, y))).toBeLessThan(0.51)
    expect(s.heightAt(50, 95)).toBeCloseTo(s.groundAt(50, 95), 6)
  })

  it('downhill the ground is filled up to the road the same way (Raise and lower)', () => {
    for (let y = 20; y < 47; y++) expect(Math.abs(s.heightAt(50, y + 1) - s.heightAt(50, y))).toBeLessThan(0.51)
  })
})
