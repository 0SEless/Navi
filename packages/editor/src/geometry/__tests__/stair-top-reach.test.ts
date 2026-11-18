import { describe, expect, it } from 'vitest'
import type { Building, CampusDocument } from '@navi/core'
import { stairTopReach } from '../stair-top-reach'
import { getFloorPorts } from '../floor-connections'
import { stairTopReachRule } from '../../validation/rules/modules/feature-rules'
import type { ValidationContext } from '../../validation/rules/types'

// Straight stair on Floor 1 at x=0, climbing east (+x) 4 steps × 0.5 m → its top landing (2 m, as wide as the
// stair) starts at x = 1 and runs to x = 3 along y ∈ [-1, 1].
const drawing = { definitionId: 'stair' as const, properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' } }
function building(floor2: Record<string, unknown>, toLevel = 1): Building {
  return {
    id: 'b', name: 'B',
    floors: [
      { id: 'f0', level: 0, label: 'Floor 1', elevation: 0, height: 3.5, rooms: [], hallways: [], walls: [] },
      { id: 'f1', level: 1, label: 'Floor 2', elevation: 3.5, height: 3.5, rooms: [], hallways: [], walls: [], ...floor2 },
    ],
    staircases: [{ id: 's', buildingId: 'b', name: 'Tower stair', type: 'open', accessible: false, fromLevel: 0, toLevel,
      levels: { 0: { position: { x: 0, y: 0 }, rotation: 0, drawing }, ...(toLevel > 0 ? { 1: { role: 'top', position: { x: 2, y: 0 }, rotation: 0 } } : {}) } }],
  } as unknown as Building
}
const hallwayAt = (x: number) => ({ hallways: [{ id: 'h', name: 'Corridor', width: 2, polyline: { points: [{ x, y: -5 }, { x, y: 5 }] } }] })
const stair = (b: Building) => b.staircases![0]

describe('stair top reach', () => {
  it('a top landing touching a Floor 2 hallway reaches it', () => {
    const b = building(hallwayAt(4))
    const reach = stairTopReach(b, stair(b))
    expect(reach.ok).toBe(true)
  })

  it('finds the indoor route on the destination floor without a legacy hallway', () => {
    const b = building({ routeNetwork: {
      nodes: [
        { id: 'a', position: { x: 3, y: -2 }, type: 'waypoint', floor: 1 },
        { id: 'b', position: { x: 3, y: 2 }, type: 'waypoint', floor: 1 },
      ],
      edges: [{ id: 'floor-2-route', from: 'a', to: 'b', type: 'walk', distance: 4 }],
    } })
    expect(stairTopReach(b, stair(b))).toMatchObject({ ok: true, targetId: 'floor-2-route', exit: 'front' })
  })

  it('a top landing 1 m short of the hallway does not reach (it would float; owner 2026-11-16)', () => {
    const b = building(hallwayAt(5))
    expect(stairTopReach(b, stair(b))).toEqual({ ok: false, reason: 'no-walkable' })
  })

  it('a top landing 3 m from anything walkable on Floor 2 does not reach', () => {
    const b = building(hallwayAt(8))
    expect(stairTopReach(b, stair(b))).toEqual({ ok: false, reason: 'no-walkable' })
  })

  it('a balcony or room drawn on Floor 2 counts as walkable', () => {
    const room = { rooms: [{ id: 'balcony', name: 'Balcony', polygon: { points: [{ x: 3.1, y: -2 }, { x: 6, y: -2 }, { x: 6, y: 2 }, { x: 3.1, y: 2 }] } }] }
    const b = building(room)
    expect(stairTopReach(b, stair(b)).ok).toBe(true)
  })

  it('a one-floor stair has no top to check', () => {
    const b = building({}, 0)
    expect(stairTopReach(b, stair(b))).toEqual({ ok: false, reason: 'no-to-floor' })
  })

  it("Validate warns: Top doesn't reach Floor 2's hallway", () => {
    const doc = { buildings: [building(hallwayAt(8))] } as unknown as CampusDocument
    const issues = stairTopReachRule.execute({ document: doc } as unknown as ValidationContext)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toBe(`Tower stair: Top doesn't reach Floor 2's hallway`)
    const ok = stairTopReachRule.execute({ document: { buildings: [building(hallwayAt(4))] } } as unknown as ValidationContext)
    expect(ok).toHaveLength(0)
  })

  it("Floor 2's connection review sees the stair top as a port to join to its route, at the top", () => {
    const b = building(hallwayAt(4))
    const ports = getFloorPorts(b, b.floors[1])
    const port = ports.find((p) => p.key === 'stair:s')
    expect(port?.position).toEqual({ x: 2, y: 0 })
    expect(port?.connection).toBeUndefined()
  })

  it('older multi-floor stairs (no top marked) are not judged by the rule', () => {
    const b = building(hallwayAt(8))
    delete (b.staircases![0].levels[1] as { role?: string }).role
    expect(stairTopReachRule.execute({ document: { buildings: [b] } } as unknown as ValidationContext)).toHaveLength(0)
  })

  it('a top against a wall with no opening does not reach; with an opening there it does (owner 2026-11-17)', () => {
    const wall = { id: 'wall', start: { x: 3.1, y: -5 }, end: { x: 3.1, y: 5 }, height: 3.5, thickness: 0.2 }
    const closed = building({ ...hallwayAt(4), walls: [wall] })
    expect(stairTopReach(closed, stair(closed))).toEqual({ ok: false, reason: 'no-opening' })
    const open = building({ ...hallwayAt(4), walls: [wall], openings: [{ id: 'o', type: 'door', wallId: 'wall', offset: 4, width: 2, height: 2.1, sillHeight: 0, doorAppearance: 'open' }] })
    expect(stairTopReach(open, stair(open)).ok).toBe(true)
    const issues = stairTopReachRule.execute({ document: { buildings: [closed] } } as unknown as ValidationContext)
    expect(issues[0].message).toBe("Tower stair: Top meets a wall with no opening on Floor 2")
  })
})

it('checks the selected landing edge instead of passing because a different edge reaches a corridor', () => {
  const b = building({ hallways: [{ id: 'side', name: 'Side corridor', width: 2,
    polyline: { points: [{ x: 1, y: 2 }, { x: 1.9, y: 2 }] } }] })
  stair(b).levels[0].landingExit = 'front'
  expect(stairTopReach(b, stair(b))).toEqual({ ok: false, reason: 'no-walkable' })
  stair(b).levels[0].landingExit = 'left'
  expect(stairTopReach(b, stair(b))).toMatchObject({ ok: true, targetId: 'side' })
})

it('does not count a corner touching a corridor as a usable front exit', () => {
  const b = building({ hallways: [{ id: 'side', name: 'Side corridor', width: 2,
    polyline: { points: [{ x: 0, y: 2.14 }, { x: 5, y: 2.14 }] } }] })
  stair(b).levels[0].landingExit = 'front'
  expect(stairTopReach(b, stair(b))).toEqual({ ok: false, reason: 'no-walkable' })
  stair(b).levels[0].landingExit = 'left'
  expect(stairTopReach(b, stair(b)).ok).toBe(true)
})
