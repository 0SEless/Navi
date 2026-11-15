import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Road } from '../../types/entities'
import { toLatLng } from '../grid'
import { createTerrainSampler } from '../compose'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

// Owner 2026-11-15: "a road should own its own platform … always flat, it will not curve or look like a wave".
// Every road (unless its ground fit is explicitly Off) is level across and runs in straight grades between its
// ends, its pins and its crossings with other roads; the hill's bumps never show on it.
const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const bumps = (x: number, y: number) => 0.05 * x + 1.2 * Math.sin(x / 5) + 0.6 * Math.cos(y / 4)
function base(): TerrainBaseSource {
  const vertices: Array<[number, number, number]> = []
  const triangles: Array<[number, number, number]> = []
  const n = 80
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = -20 + (160 * i) / n
    const y = -20 + (160 * j) / n
    const p = ll(x, y)
    vertices.push([p.lat, p.lng, bumps(x, y)])
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i
    triangles.push([a, a + 1, a + n + 2], [a, a + n + 2, a + n + 1])
  }
  return { kind: 'mesh', vertices, triangles, sourceNote: 'test' }
}
const road = (id: string, pts: Array<[number, number]>, extra: Partial<Road> = {}): Road => ({
  id, name: id, polyline: { points: pts.map(([x, y]) => ll(x, y)) }, width: 6, surface: 'asphalt', type: 'connector', metadata: {}, ...extra,
} as unknown as Road)
const sampler = (roads: Road[]) => createTerrainSampler({
  schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads, panoramas: [], qrCheckpoints: [],
  terrain: { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: base(), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain,
} as unknown as CampusDocument)!

describe('roads are platforms', () => {
  it('a plain road (no grade settings) is level across and a straight grade along — no waves', () => {
    const s = sampler([road('a', [[0, 50], [100, 50]])])
    const h0 = s.heightAt(0, 50)
    const h100 = s.heightAt(100, 50)
    for (const x of [10, 25, 40, 55, 70, 85]) {
      expect(s.heightAt(x, 50)).toBeCloseTo(h0 + ((h100 - h0) * x) / 100, 1)
      expect(s.heightAt(x, 47.5)).toBeCloseTo(s.heightAt(x, 52.5), 1)
    }
  })

  it('pins make straight grades between them', () => {
    const s = sampler([road('a', [[0, 50], [100, 50]], { grade: { smoothness: 1, pins: [{ alongM: 0, heightM: 2 }, { alongM: 40, heightM: 6 }, { alongM: 100, heightM: 6 }] } })])
    expect(s.heightAt(20, 50)).toBeCloseTo(4, 1)
    expect(s.heightAt(70, 50)).toBeCloseTo(6, 1)
  })

  it('two roads that cross share one height there (no step)', () => {
    const s = sampler([road('a', [[0, 50], [100, 50]]), road('b', [[50, 0], [50, 100]])])
    // Walking through the crossing on either road: no jump bigger than a normal grade over half a metre.
    for (let t = 40; t < 60; t += 0.5) {
      expect(Math.abs(s.heightAt(t + 0.5, 50) - s.heightAt(t, 50))).toBeLessThan(0.1)
      expect(Math.abs(s.heightAt(50, t + 0.5) - s.heightAt(50, t))).toBeLessThan(0.1)
    }
  })

  it('Grade ground Off leaves the road on the hill', () => {
    const s = sampler([road('a', [[0, 50], [100, 50]], { groundFit: { mode: 'off', blendMeters: 3 } })])
    expect(s.heightAt(30, 50)).toBeCloseTo(s.groundAt(30, 50), 6)
  })

  it('"Follow the hill" keeps the smoothed shape when chosen', () => {
    const s = sampler([road('a', [[0, 50], [100, 50]], { grade: { smoothness: 0, shape: 'follow' } })])
    expect(Math.abs(s.heightAt(30, 50) - s.groundAt(30, 50))).toBeLessThan(0.6)
  })
})

describe('junctions win over nearby pins; stair routes do not shape the ground (owner 2026-11-15)', () => {
  it('a pin just inside a junction does not make a step: the junction height wins there', () => {
    const s = sampler([
      road('a', [[0, 50], [100, 50]]),
      road('b', [[50, 50], [50, 100]], { grade: { smoothness: 1, pins: [{ alongM: 1.1, heightM: 9 }] } }),
    ])
    for (let y = 50; y < 60; y += 0.5) expect(Math.abs(s.heightAt(50, y + 0.5) - s.heightAt(50, y))).toBeLessThan(0.15)
  })

  it('the walking route along a stair (routing.structureId) leaves the ground alone', () => {
    const s = sampler([road('route', [[0, 50], [100, 50]], { routing: { feature: 'stairs', structureId: 's1' } } as never)])
    expect(s.heightAt(30, 50)).toBeCloseTo(s.groundAt(30, 50), 6)
  })
})

describe('junctions are seamless (owner 2026-11-15: steps where roads meet)', () => {
  // A steep 8 m main road and a steep 6 m side road; a step would show as a jump bigger than the grade.
  const steep = (id: string, pts: Array<[number, number]>, from: number, to: number, width: number) =>
    road(id, pts, { width, grade: { smoothness: 1, pins: [{ alongM: 0, heightM: from }, { alongM: 100, heightM: to }] } })

  it('T junction: the side road starts at the main road edge, at the main road height there', () => {
    const s = sampler([steep('main', [[0, 50], [100, 50]], 0, 20, 8), steep('side', [[50, 50], [50, 150]], 30, 0, 6)])
    for (let y = 46; y < 70; y += 0.5) expect(Math.abs(s.heightAt(50, y + 0.5) - s.heightAt(50, y))).toBeLessThan(0.3 * 0.5 + 0.05)
    for (let x = 30; x < 70; x += 0.5) expect(Math.abs(s.heightAt(x + 0.5, 50) - s.heightAt(x, 50))).toBeLessThan(0.2 * 0.5 + 0.05)
    expect(s.heightAt(50, 50)).toBeCloseTo(10, 1) // the main road is not bent by the side road
  })

  it('X crossing: level across the crossing square, no step walking through on either road', () => {
    const s = sampler([steep('a', [[0, 50], [100, 50]], 0, 20, 8), steep('b', [[50, 0], [50, 100]], 30, 0, 6)])
    for (let t = 30; t < 70; t += 0.5) {
      expect(Math.abs(s.heightAt(t + 0.5, 50) - s.heightAt(t, 50))).toBeLessThan(0.3 * 0.5 + 0.05)
      expect(Math.abs(s.heightAt(50, t + 0.5) - s.heightAt(50, t))).toBeLessThan(0.3 * 0.5 + 0.05)
    }
    expect(s.heightAt(48, 52)).toBeCloseTo(s.heightAt(52, 48), 1)
  })
})
