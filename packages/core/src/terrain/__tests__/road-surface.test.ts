import { describe, expect, it } from 'vitest'
import { toLatLng, toLocal } from '../grid'
import { roadSurfacePolygons } from '../road-surface'
import type { SiteRoadSurface } from '../site-artifact'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function road(points: Array<[number, number]>, width = 6): SiteRoadSurface {
  return { id: 'r1', polyline: points.map(([x, y]) => ll(x, y)), width, type: 'connector', startHeightM: 3, endHeightM: 5 }
}

function ring(fc: GeoJSON.FeatureCollection, index = 0) {
  const geometry = fc.features[index].geometry as GeoJSON.Polygon
  return geometry.coordinates[0].map(([lng, lat]) => toLocal(grid, { lat, lng }))
}

describe('roadSurfacePolygons', () => {
  it('road polygon width equals road width ±1 cm at a straight segment', () => {
    const fc = roadSurfacePolygons([road([[0, 0], [100, 0]])])
    expect(fc.features).toHaveLength(1)
    const ys = ring(fc).map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 2)
    expect(fc.features[0].properties).toMatchObject({ id: 'r1', width: 6, startHeightM: 3, endHeightM: 5 })
  })

  it('the ring is closed and covers the bend without a gap (miter within limit 2)', () => {
    const fc = roadSurfacePolygons([road([[0, 0], [50, 0], [50, 50]], 4)])
    const points = ring(fc)
    expect(points[0].x).toBeCloseTo(points[points.length - 1].x, 9)
    expect(points[0].y).toBeCloseTo(points[points.length - 1].y, 9)
    // The outer corner of a right-angle bend is the miter point (52, -2).
    expect(points.some((p) => Math.abs(p.x - 52) < 0.01 && Math.abs(p.y + 2) < 0.01)).toBe(true)
  })

  it('a sharp turn is bevelled: no corner further than twice the half width from the bend', () => {
    // A 150° turn: a miter would reach 3.9 half widths out; miter limit 2 bevels it.
    const turn = (150 * Math.PI) / 180
    const fc = roadSurfacePolygons([road([[0, 0], [50, 0], [50 + 30 * Math.cos(turn), 30 * Math.sin(turn)]], 4)])
    const far = Math.max(...ring(fc).filter((p) => Math.hypot(p.x - 50, p.y) < 10).map((p) => Math.hypot(p.x - 50, p.y)))
    expect(far).toBeGreaterThan(1.99)
    expect(far).toBeLessThanOrEqual(2 * 2 + 1e-6)
  })

  it('roads with fewer than two points are left out', () => {
    expect(roadSurfacePolygons([road([[0, 0]])]).features).toHaveLength(0)
  })
})

describe('offsetRoadLine', () => {
  it('runs alongside the road at the given distance: + to the left, − to the right', async () => {
    const { offsetRoadLine } = await import('../road-surface')
    const left = offsetRoadLine(road([[0, 0], [100, 0]]), 2.7).map((p) => toLocal(grid, p))
    const right = offsetRoadLine(road([[0, 0], [100, 0]]), -2.7).map((p) => toLocal(grid, p))
    for (const p of left) expect(p.y).toBeCloseTo(2.7, 2)
    for (const p of right) expect(p.y).toBeCloseTo(-2.7, 2)
    expect(left).toHaveLength(2)
  })
})

describe('siteRoadSurfaces', () => {
  it('a route made over an outdoor stair is not drawn as a road (the stair is the visual)', async () => {
    const { siteRoadSurfaces } = await import('../road-surface')
    const { createTerrainSampler } = await import('../compose')
    const doc = {
      schemaVersion: 1, version: 0, metadata: {}, buildings: [], panoramas: [], qrCheckpoints: [],
      terrain: { reference: { name: 'Flat', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 10 } },
      roads: [
        { id: 'r1', name: 'Road', polyline: { points: [ll(0, 0), ll(50, 0)] }, width: 6, surface: 'paved', type: 'connector', metadata: {} },
        { id: 'rd-stair-s1', name: '', polyline: { points: [ll(10, 0), ll(10, 20)] }, width: 2, surface: 'paved', type: 'pedestrian', routing: { feature: 'stairs', structureId: 's1' }, metadata: {} },
      ],
    } as never
    expect(siteRoadSurfaces(doc, createTerrainSampler(doc)!).map((s) => s.id)).toEqual(['r1'])
  })
})
