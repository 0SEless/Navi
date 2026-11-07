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

  it('a narrow road: edge lines only; a path: no markings', () => {
    expect(kinds(roadMarkings([road('service', 4)]))).toEqual(['edge', 'edge'])
    expect(roadMarkings([road('pedestrian', 6)]).features).toEqual([])
  })
})
