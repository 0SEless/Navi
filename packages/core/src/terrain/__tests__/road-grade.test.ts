import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Road } from '../../types/entities'
import { toLatLng } from '../grid'
import { createTerrainSampler } from '../compose'
import { junctionPins, roadGradeProfile, type RoadProfile } from '../road-grade'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const bumpy = (x: number) => 0.1 * x + Math.sin(x / 3)
const line = Array.from({ length: 121 }, (_, i) => ({ x: i, y: 0 }))

function secondDiffMax(f: (s: number) => number, from: number, to: number) {
  let max = 0
  for (let s = from + 1; s < to - 1; s++) max = Math.max(max, Math.abs(f(s + 1) - 2 * f(s) + f(s - 1)))
  return max
}

describe('roadGradeProfile', () => {
  it('Smooth irons out the bumps; Follow hill stays close to the ground', () => {
    const smooth = roadGradeProfile(line, (x) => bumpy(x), { smoothness: 1 }, {})
    const follow = roadGradeProfile(line, (x) => bumpy(x), { smoothness: 0 }, {})
    expect(secondDiffMax((s) => smooth.heightAtAlong(s), 0, 120)).toBeLessThan(0.05 * secondDiffMax(bumpy, 0, 120))
    for (let s = 0; s <= 120; s++) expect(Math.abs(follow.heightAtAlong(s) - bumpy(s))).toBeLessThan(0.6)
  })

  it('passes exactly through a pin, without a jump', () => {
    const p = roadGradeProfile(line, (x) => bumpy(x), { smoothness: 0.5, pins: [{ alongM: 40, heightM: 9 }] }, {})
    expect(p.heightAtAlong(40)).toBeCloseTo(9, 6)
    for (let s = 1; s <= 120; s++) expect(Math.abs(p.heightAtAlong(s) - p.heightAtAlong(s - 1))).toBeLessThan(0.3)
  })

  it('a 2-point or zero-length road gives finite heights', () => {
    const two = roadGradeProfile([{ x: 0, y: 0 }, { x: 5, y: 0 }], (x) => x, { smoothness: 1 }, {})
    const none = roadGradeProfile([{ x: 3, y: 3 }, { x: 3, y: 3 }], () => 2, { smoothness: 1, pins: [{ alongM: 0, heightM: 4 }] }, {})
    expect(Number.isFinite(two.heightAtAlong(2.5))).toBe(true)
    expect(Number.isFinite(none.heightAtAlong(0))).toBe(true)
  })
})

describe('junctionPins', () => {
  const flat = (h: number, length: number): RoadProfile => ({ lengthM: length, heightAtAlong: () => h })
  const main = { id: 'main', line: [{ x: 0, y: 0 }, { x: 100, y: 0 }], halfWidth: 3, profile: flat(3, 100), pins: [] as Array<{ alongM: number; heightM: number }> }
  const side = { id: 'side', line: [{ x: 50, y: 1 }, { x: 50, y: 50 }], halfWidth: 3, profile: flat(5, 49), pins: [] as Array<{ alongM: number; heightM: number }> }

  it('roads meeting share the mean height at the joint (an end on one, a point along the other)', () => {
    const pins = junctionPins([main, side])
    expect(pins.get('side')).toEqual([{ alongM: 0, heightM: 4 }])
    expect(pins.get('main')).toEqual([{ alongM: 50, heightM: 4 }])
  })

  it('a pin already at the joint wins', () => {
    const pins = junctionPins([main, { ...side, pins: [{ alongM: 0, heightM: 6 }] }])
    expect(pins.get('side')![0].heightM).toBe(6)
    expect(pins.get('main')![0].heightM).toBe(6)
  })
})

describe('graded roads in the ground', () => {
  const base = (): TerrainBaseSource => {
    const vertices: Array<[number, number, number]> = []
    const triangles: Array<[number, number, number]> = []
    const n = 40
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = -20 + (140 * i) / n
      const y = -20 + (140 * j) / n
      const p = ll(x, y)
      vertices.push([p.lat, p.lng, 5 + 0.05 * x + 0.08 * y + Math.sin(x / 4) * 0.8])
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      triangles.push([a, a + 1, a + n + 2], [a, a + n + 2, a + n + 1])
    }
    return { kind: 'mesh', vertices, triangles, sourceNote: 'test' }
  }
  const road = (id: string, pts: Array<[number, number]>, extra: Partial<Road> = {}): Road => ({
    id, name: id, polyline: { points: pts.map(([x, y]) => ll(x, y)) }, width: 6, surface: 'asphalt', type: 'connector', metadata: {},
    groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 1 }, ...extra,
  } as unknown as Road)
  const doc = (roads: Road[]): CampusDocument => ({
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], panoramas: [], qrCheckpoints: [], roads,
    terrain: { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: base(), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain,
  }) as unknown as CampusDocument

  it('across a graded road the ground is level with its profile', () => {
    const s = createTerrainSampler(doc([road('a', [[0, 50], [100, 50]])]))!
    for (const x of [20, 50, 80]) expect(s.heightAt(x, 48)).toBeCloseTo(s.heightAt(x, 52), 1)
  })

  it('a building beside the road does not tilt or crease the road (owner 2026-11-15)', () => {
    // Wall at y = 54, 1 m past the road edge (y = 53): the building's 2.5 m dig-out strip overlaps the road.
    const square = [ll(30, 54), ll(60, 54), ll(60, 70), ll(30, 70), ll(30, 54)]
    const building = { id: 'b1', name: 'b1', footprint: { points: square }, baseElevation: 20, ground: { baseMode: 'fixed', pad: { mode: 'off', blendMeters: 3 } }, floors: [], metadata: {} }
    const s = createTerrainSampler({ ...doc([road('a', [[0, 50], [100, 50]])]), buildings: [building] } as unknown as CampusDocument)!
    for (const x of [35, 45, 55]) {
      expect(s.heightAt(x, 52.5)).toBeCloseTo(s.heightAt(x, 47.5), 1)
      expect(s.heightAt(x, 60)).toBeCloseTo(20, 6)
    }
  })

  it('no step where two graded roads meet', () => {
    const s = createTerrainSampler(doc([road('main', [[0, 50], [100, 50]]), road('side', [[50, 51], [50, 100]])]))!
    expect(Math.abs(s.heightAt(50, 53.5) - s.heightAt(50, 54.5))).toBeLessThan(0.15)
  })

  it('a road with a ground fit but no grading keeps today\'s straight profile', () => {
    const withGrade = createTerrainSampler(doc([road('a', [[0, 50], [100, 50]], { grade: undefined })]))!
    const ends = (withGrade.heightAt(0, 50) + withGrade.heightAt(100, 50)) / 2
    expect(withGrade.heightAt(50, 50)).toBeCloseTo(ends, 1)
  })

  it('a zero-length graded road does not break the ground', () => {
    const s = createTerrainSampler(doc([road('z', [[30, 30], [30, 30]])]))!
    expect(Number.isFinite(s.heightAt(30, 30))).toBe(true)
  })
})

describe('height field and graded roads', () => {
  it('an update touching a graded road refreshes the whole graded strip', async () => {
    const { createHeightField } = await import('../height-field')
    const g: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
    const p = (x: number, y: number) => toLatLng(g, { x, y })
    const vertices: Array<[number, number, number]> = [[p(-200, -200).lat, p(-200, -200).lng, 0], [p(200, -200).lat, p(200, -200).lng, 40], [p(200, 200).lat, p(200, 200).lng, 40], [p(-200, 200).lat, p(-200, 200).lng, 0]]
    const terrain = { reference: { name: 'T', zeroMeaning: 'Sea' }, grid: g, base: { kind: 'mesh', vertices, triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 't' }, colorRange: { minM: 0, maxM: 40 } }
    const make = (roads: unknown[]) => ({ schemaVersion: 1, version: 0, metadata: {}, buildings: [], panoramas: [], qrCheckpoints: [], roads, boundary: { points: [p(-60, -60), p(60, -60), p(60, 60), p(-60, 60)] }, terrain }) as unknown as CampusDocument
    const field = createHeightField(make([]))!
    const graded = make([{ id: 'r', polyline: { points: [p(-50, 0), p(50, 0)] }, width: 6, type: 'connector', metadata: {}, groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 1, pins: [{ alongM: 50, heightM: 30 }] } }])
    field.update(graded, { minX: -2, minY: -2, maxX: 2, maxY: 2 })
    expect(field.heightAt(40, 0)).toBeCloseTo(createTerrainSampler(graded)!.heightAt(40, 0), 1)
  })
})
