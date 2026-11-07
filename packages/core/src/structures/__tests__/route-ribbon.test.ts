import { describe, expect, it } from 'vitest'
import { toLatLng, toLocal } from '../../terrain/grid'
import { buildRouteRibbon } from '../route-ribbon'

const origin = { lat: 11.8, lng: 122.1 }
const grid = { originLat: origin.lat, originLng: origin.lng }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
/** A stair: a 0.175 m riser every 0.33 m going east (no riser edge falls on a 0.5 m sample). */
const stairSurface = (p: { lat: number; lng: number }) => 20 + Math.floor(toLocal(grid, p).x / 0.33) * 0.175

describe('buildRouteRibbon', () => {
  it('route ribbon z equals the stair surface + 0.05 m on a stair', () => {
    const mesh = buildRouteRibbon([ll(0, 0), ll(10, 0)], stairSurface, origin)
    expect(mesh.length).toBeGreaterThan(0)
    for (let i = 0; i < mesh.length; i += 9) {
      const [x, , z] = [mesh[i], mesh[i + 1], mesh[i + 2]]
      // The ribbon is flat across its width; its height is the surface at that point along the route.
      expect(z).toBeCloseTo(stairSurface(ll(Math.min(10, Math.max(0, x)), 0)) + 0.05, 5)
    }
  })

  it('samples every 0.5 m (two triangles per step), 0.6 m wide, in the route colour', () => {
    const mesh = buildRouteRibbon([ll(0, 0), ll(10, 0)], () => 0, origin)
    expect(mesh.length / 9).toBe(20 * 6)
    const ys = new Set<number>()
    for (let i = 1; i < mesh.length; i += 9) ys.add(Math.round(mesh[i] * 1000) / 1000)
    expect([...ys].sort((a, b) => a - b)).toEqual([-0.3, 0.3])
    expect([mesh[6], mesh[7], mesh[8]].map((c) => Math.round(c * 255))).toEqual([0x25, 0x63, 0xeb])
  })

  it('a path with fewer than two points draws nothing', () => {
    expect(buildRouteRibbon([ll(0, 0)], () => 0, origin).length).toBe(0)
  })
})
