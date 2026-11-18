import { describe, expect, it } from 'vitest'
import { routeFloorRibbons } from '../route-floor-ribbons'

// Owner 2026-11-18: "there is no routing showing on the floor … it should show on the floor". In the 2.5D view each
// floor stands at its height; the route inside the open building is drawn as a strip lying on each shown floor.

const M = 1 / 111320
const nodes: Record<string, { lat: number; lng: number; floor: number; buildingId: string }> = {
  out: { lat: 11, lng: 122, floor: 0, buildingId: '' },
  door: { lat: 11 + 10 * M, lng: 122, floor: 0, buildingId: 'b' },
  hall: { lat: 11 + 20 * M, lng: 122, floor: 0, buildingId: 'b' },
  stairUp: { lat: 11 + 20 * M, lng: 122 + 5 * M, floor: 1, buildingId: 'b' },
  room: { lat: 11 + 30 * M, lng: 122 + 5 * M, floor: 1, buildingId: 'b' },
}
const input = {
  path: ['out', 'door', 'hall', 'stairUp', 'room'],
  node: (id: string) => nodes[id],
  buildingId: 'b',
  elevations: new Map([[0, 0], [1, 3.5]]),
  topFloor: 1,
}

describe('routeFloorRibbons', () => {
  it('draws the indoor parts on their floors, at the floor height, never outdoors or across a stair', () => {
    const fc = routeFloorRibbons(input)
    const core = fc.features.filter((f) => f.properties!.part === 'core')
    // GF: door→hall; 1F: stairUp→room. The outdoor part and the stair (floor change) are not floor strips.
    expect(core.map((f) => f.properties!.floor)).toEqual([0, 1])
    expect(core[0].properties!.base).toBeGreaterThan(0)
    expect(core[1].properties!.base).toBeGreaterThan(3.5)
    expect(core[1].properties!.height).toBeGreaterThan(core[1].properties!.base)
    // A white edge under each core strip.
    expect(fc.features.filter((f) => f.properties!.part === 'edge')).toHaveLength(2)
  })

  it('floors above the one shown are not drawn (the stack stops at the chosen floor)', () => {
    const fc = routeFloorRibbons({ ...input, topFloor: 0 })
    expect([...new Set(fc.features.map((f) => f.properties!.floor))]).toEqual([0])
  })

  it('no open building: nothing', () => {
    expect(routeFloorRibbons({ ...input, buildingId: undefined }).features).toEqual([])
  })
})
