import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { snapStructureEnd } from '../structure-snap'

// 1 pixel = 0.00001° in both directions (enough for a test projection).
const project = (p: { lat: number; lng: number }) => ({ x: p.lng * 1e5, y: -p.lat * 1e5 })
const floor = (id: string, elevation: number) => ({ id, elevation })

function doc(): CampusDocument {
  return {
    buildings: [{
      id: 'hall', floors: [floor('f1', 0), floor('f2', 3.5), floor('f3', 7)],
      footprint: { points: [{ lat: 10, lng: 20 }, { lat: 10, lng: 20.001 }, { lat: 10.0005, lng: 20.001 }, { lat: 10.0005, lng: 20 }, { lat: 10, lng: 20 }] },
    }],
    roads: [{ id: 'r1', polyline: { points: [{ lat: 10.002, lng: 20 }, { lat: 10.002, lng: 20.002 }] } }],
  } as unknown as CampusDocument
}

describe('snapStructureEnd', () => {
  it('start snaps to slab edge within 14 px', () => {
    // 10 px north of the south edge's midpoint.
    const end = snapStructureEnd(doc(), { lat: 10.0001, lng: 20.0005 }, project, { floorId: 'f2' })
    expect(end).toMatchObject({ kind: 'slab', buildingId: 'hall', floorId: 'f2', edgeIndex: 0 })
    expect((end as { edgeT: number }).edgeT).toBeCloseTo(0.5, 3)
  })

  it('without a chosen floor the top floor is used', () => {
    const end = snapStructureEnd(doc(), { lat: 10.0001, lng: 20.0005 }, project, {})
    expect(end).toMatchObject({ kind: 'slab', floorId: 'f3' })
  })

  it('end snaps to road within 14 px else ground', () => {
    const road = snapStructureEnd(doc(), { lat: 10.00212, lng: 20.001 }, project, {})
    expect(road).toMatchObject({ kind: 'road', roadId: 'r1' })
    expect((road as { position: { lat: number } }).position.lat).toBeCloseTo(10.002, 6)
    const ground = snapStructureEnd(doc(), { lat: 10.0013, lng: 20.001 }, project, {})
    expect(ground).toEqual({ kind: 'ground', position: { lat: 10.0013, lng: 20.001 } })
  })

  it('slab edges win over a road at the same distance', () => {
    const d = doc()
    d.roads[0].polyline.points = [{ lat: 10, lng: 20 }, { lat: 10, lng: 20.001 }]
    expect(snapStructureEnd(d, { lat: 10.00005, lng: 20.0005 }, project, {}).kind).toBe('slab')
  })

  it('slab edges are compared where they are drawn: at the floor height', () => {
    // A camera that shifts everything 1 px north per metre of height.
    const tilted = (q: { lat: number; lng: number }, h: number) => ({ x: q.lng * 1e5, y: -q.lat * 1e5 - h })
    const slabHeight = (_b: unknown, f: { elevation: number }) => 100 + f.elevation
    // The pointer is 107 px above the south edge on screen: the 3F slab edge (100 + 7 m) is drawn there.
    const pointer = { lat: 10, lng: 20.0005 }
    const screen = { x: 2000050, y: -1000000 - 107 }
    const end = snapStructureEnd(doc(), pointer, tilted, { screen, slabHeight })
    expect(end).toMatchObject({ kind: 'slab', floorId: 'f3', edgeIndex: 0, last: { lat: 10, heightM: 107 } })
    expect((end as { last: { lng: number } }).last.lng).toBeCloseTo(20.0005, 9)
  })
})
