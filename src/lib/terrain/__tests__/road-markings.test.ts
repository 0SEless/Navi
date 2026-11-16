import { describe, expect, it } from 'vitest'
import { toLatLng, toLocal, type SiteRoadSurface } from '@navi/core'
import { roadMarkings } from '../road-markings'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const road = (type: string, width: number): SiteRoadSurface => ({ id: `${type}-${width}`, polyline: [ll(0, 0), ll(100, 0)], width, type, startHeightM: 0, endHeightM: 0 })
const kinds = (fc: GeoJSON.FeatureCollection) => fc.features.map((f) => f.properties?.kind).sort()

describe('roadMarkings', () => {
  it('a two-lane road (≥ 5 m): white edge lines both sides and a dashed centre line', () => {
    const fc = roadMarkings([road('connector', 6)])
    expect(kinds(fc)).toEqual(['centre', 'edge', 'edge'])
    const edges = fc.features.filter((f) => f.properties?.kind === 'edge')
    const ys = edges.map((f) => toLocal(grid, { lng: (f.geometry as GeoJSON.LineString).coordinates[0][0], lat: (f.geometry as GeoJSON.LineString).coordinates[0][1] }).y).sort((a, b) => a - b)
    // 0.3 m inside the road's edge.
    expect(ys[0]).toBeCloseTo(-2.7, 2)
    expect(ys[1]).toBeCloseTo(2.7, 2)
  })

  it('a narrow road: edge lines only', () => {
    expect(kinds(roadMarkings([road('service', 4)]))).toEqual(['edge', 'edge'])
  })

  it('a footpath: only its own edge lines (path-edge), right at its sides (owner 2026-11-17: Campus walkway)', () => {
    const fc = roadMarkings([road('pedestrian', 3)])
    expect(kinds(fc)).toEqual(['path-edge', 'path-edge'])
    const ys = fc.features.map((f) => toLocal(grid, { lng: (f.geometry as GeoJSON.LineString).coordinates[0][0], lat: (f.geometry as GeoJSON.LineString).coordinates[0][1] }).y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-1.4, 2)
    expect(ys[1]).toBeCloseTo(1.4, 2)
  })
})

describe('roads join naturally at junctions', () => {
  const main: SiteRoadSurface = { id: 'main', polyline: [ll(0, 0), ll(100, 0)], width: 6, type: 'connector', startHeightM: 0, endHeightM: 0 }
  const side: SiteRoadSurface = { id: 'side', polyline: [ll(50, 0), ll(50, 50)], width: 6, type: 'connector', startHeightM: 0, endHeightM: 0 }
  const local = (f: GeoJSON.Feature) => (f.geometry as GeoJSON.LineString).coordinates.map(([lng, lat]) => toLocal(grid, { lat, lng }))

  it('the main road\'s edge line on the junction side breaks where the side road joins', () => {
    const fc = roadMarkings([main, side])
    const near = fc.features.filter((f) => f.properties?.roadId === 'main' && f.properties?.kind === 'edge' && local(f).every((p) => p.y > 2))
    expect(near.length).toBe(2)
    for (const piece of near) for (const p of local(piece)) expect(Math.abs(p.x - 50)).toBeGreaterThan(2.5)
  })

  it('the side road\'s lines stop at the main road instead of running across it', () => {
    const fc = roadMarkings([main, side])
    for (const f of fc.features.filter((f) => f.properties?.roadId === 'side')) for (const p of local(f)) expect(p.y).toBeGreaterThan(2.9)
  })
})
