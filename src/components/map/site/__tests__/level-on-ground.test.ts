import { describe, expect, it } from 'vitest'
import { levelOnGround } from '../level-on-ground'

const square = (lng: number, lat: number, d = 0.0001): GeoJSON.Position[][] => [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]]
const feature = (coordinates: GeoJSON.Position[][], base: number, height: number): GeoJSON.Feature =>
  ({ type: 'Feature', properties: { base, height, id: 'w' }, geometry: { type: 'Polygon', coordinates } })

// Ground rises 1 m per 0.0001 degree of longitude.
const slope = (p: { lat: number; lng: number }) => (p.lng - 120) * 10000

describe('levelOnGround', () => {
  it('cancels the ground MapLibre adds under each piece so every piece stands on the same floor', () => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [feature(square(120, 11), 0, 3), feature(square(120.0004, 11), 0, 3)] }
    const out = levelOnGround(fc, slope, 2)
    // Centres sit at ground 0.5 m and 4.5 m; the floor is at 2 m.
    const [a, b] = out.features.map((f) => f.properties!)
    expect(a.base + 0.5).toBeCloseTo(2)
    expect(a.height + 0.5).toBeCloseTo(5)
    expect(b.base + 4.5).toBeCloseTo(2)
    expect(b.height + 4.5).toBeCloseTo(5)
    expect(a.id).toBe('w')
  })

  it('splits a multipolygon so each part gets its own correction (MapLibre lifts each part by its own centre)', () => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { base: 1, height: 2 }, geometry: { type: 'MultiPolygon', coordinates: [square(120, 11), square(120.0004, 11)] } }] }
    const out = levelOnGround(fc, slope, 0)
    expect(out.features).toHaveLength(2)
    expect(out.features[0].properties!.base).toBeCloseTo(0.5)
    expect(out.features[1].properties!.height).toBeCloseTo(-2.5)
  })

  it('leaves features without heights or polygons untouched', () => {
    const line: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[120, 11], [120.001, 11]] } }
    const out = levelOnGround({ type: 'FeatureCollection', features: [line] }, slope, 0)
    expect(out.features[0]).toBe(line)
  })
})
