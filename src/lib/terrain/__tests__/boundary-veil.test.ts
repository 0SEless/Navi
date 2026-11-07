import { describe, expect, it } from 'vitest'
import { boundaryVeil } from '../boundary-veil'

const ring = [{ lat: 11.8163, lng: 122.169 }, { lat: 11.8163, lng: 122.173 }, { lat: 11.819, lng: 122.173 }, { lat: 11.819, lng: 122.169 }]

describe('boundaryVeil', () => {
  it('is the whole world with the campus as its hole (the outside is softly faded)', () => {
    const veil = boundaryVeil(ring)!
    const [outer, hole] = (veil.geometry as GeoJSON.Polygon).coordinates
    expect(outer[0]).toEqual(outer[outer.length - 1])
    expect(Math.min(...outer.map(([lng]) => lng))).toBeLessThanOrEqual(-179)
    // The hole is the boundary, closed.
    expect(hole).toHaveLength(ring.length + 1)
    expect(hole[0]).toEqual(hole[hole.length - 1])
    expect(new Set(hole.map(([lng, lat]) => `${lng},${lat}`))).toEqual(new Set(ring.map((p) => `${p.lng},${p.lat}`)))
  })

  it('no boundary → no veil', () => {
    expect(boundaryVeil([])).toBeNull()
    expect(boundaryVeil(ring.slice(0, 2))).toBeNull()
  })
})
