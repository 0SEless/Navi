import { describe, expect, it } from 'vitest'
import { pathToDoors, routeFloorRibbons } from '../route-floor-ribbons'

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
  it('draws the indoor parts on their floors, at the floor height, and the entry link from outside', () => {
    const fc = routeFloorRibbons(input)
    const core = fc.features.filter((f) => f.properties!.part === 'core' && !f.properties!.climb)
    // out→door (the link from the road, GF), door→hall (GF), stairUp→room (1F).
    expect(core.map((f) => f.properties!.floor)).toEqual([0, 0, 1])
    expect(core[0].properties!.base).toBeGreaterThan(0)
    expect(core[2].properties!.base).toBeGreaterThan(3.5)
    expect(core[2].properties!.height).toBeGreaterThan(core[2].properties!.base)
    // A white edge under each core strip.
    expect(fc.features.filter((f) => f.properties!.part === 'edge' && !f.properties!.climb)).toHaveLength(3)
  })

  it('a change of floor is not drawn as a 3D ramp (owner 2026-11-18: not needed)', () => {
    expect(routeFloorRibbons(input).features.filter((f) => f.properties!.climb)).toEqual([])
    expect(routeFloorRibbons({ ...input, path: ['out', 'stairUp'] }).features).toEqual([])
  })

  it('floors above the one shown are not drawn (the stack stops at the chosen floor)', () => {
    const fc = routeFloorRibbons({ ...input, topFloor: 0 })
    expect([...new Set(fc.features.map((f) => f.properties!.floor))]).toEqual([0])
  })

  it('no open building: nothing', () => {
    expect(routeFloorRibbons({ ...input, buildingId: undefined }).features).toEqual([])
  })
})

describe('pathToDoors (owner 2026-11-18: the line should go only to the door, not into the room)', () => {
  const isRoom = (id: string) => id.startsWith('room')
  it('drops a room at the end (and at the start) so the line stops at its door', () => {
    expect(pathToDoors(['a', 'b', 'door', 'room-cs202'], isRoom)).toEqual(['a', 'b', 'door'])
    expect(pathToDoors(['room-cs201', 'door', 'b'], isRoom)).toEqual(['door', 'b'])
  })
  it('keeps a path that is only a room and its door', () => {
    expect(pathToDoors(['door', 'room-x'], isRoom)).toEqual(['door', 'room-x'])
  })
})
