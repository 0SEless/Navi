import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Building } from '../../types/entities'
import type { Structure } from '../../structures/types'
import { toLatLng, toLocal } from '../grid'
import type { TerrainGrid } from '../types'
import { stairMarking, structureCentreline } from '../structure-marking'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const local = (p: { lat: number; lng: number }) => toLocal(grid, p)

const floorAt = (id: string, elevation: number) => ({ id, level: 0, label: id, elevation, height: 3, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })
const hall = {
  id: 'hall', name: 'Hall', code: 'H', category: 'academic', description: '', baseElevation: 0, height: 6,
  footprint: { points: [ll(0, 0), ll(20, 0), ll(20, 10), ll(0, 10), ll(0, 0)] },
  floors: [floorAt('f1', 0), floorAt('f2', 3)], verticalConnectors: [], color: '#000', aliases: [], metadata: {},
} as unknown as Building

/** A 2 m wide stair from the hall's east edge at 2F (3 m) down to a road 20 m east, on flat ground. */
function campus(form: Structure['form'] = 'stairs', withHall = true): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'Flat', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 10 } },
    boundary: { points: [ll(-50, -50), ll(100, -50), ll(100, 60), ll(-50, 60)] },
    buildings: withHall ? [hall] : [],
    roads: [{ id: 'r1', name: 'Lower road', polyline: { points: [ll(40, -20), ll(40, 30)] }, width: 4, surface: 'paved', type: 'pedestrian', metadata: {} }],
    structures: [{
      id: 's1', form, presetId: 'p', width: 2, underneath: 'open', railings: 'both',
      start: { kind: 'slab', buildingId: 'hall', floorId: 'f2', edgeIndex: 1, edgeT: 0.5 },
      end: { kind: 'road', roadId: 'r1', position: ll(40, 5) },
    }],
  } as unknown as CampusDocument
}

describe('structureCentreline', () => {
  it('centreline runs from the slab edge to the road end, one point per metre', () => {
    const d = campus()
    const line = structureCentreline(d, d.structures![0])!
    expect(line).toHaveLength(21)
    expect(local(line[0]).x).toBeCloseTo(20, 3)
    expect(local(line[0]).y).toBeCloseTo(5, 3)
    expect(local(line[20]).x).toBeCloseTo(40, 3)
    expect(local(line[20]).y).toBeCloseTo(5, 3)
  })

  it('an end on a deleted building (no last position) gives null', () => {
    const d = campus('stairs', false)
    expect(structureCentreline(d, d.structures![0])).toBeNull()
    expect(stairMarking(d, d.structures![0])).toBeNull()
  })
})

describe('stairMarking', () => {
  it('a stair marking has one line per step and an arrow pointing uphill', () => {
    const d = campus()
    const m = stairMarking(d, d.structures![0])!
    expect(m.steps).toHaveLength(Math.round(3 / 0.175))
    // The start (the slab, 3 m) is the high end: the arrow points from the road towards the building.
    expect(m.uphillAtEnd).toBe(false)
    expect(local(m.arrow[1]).x).toBeLessThan(local(m.arrow[0]).x)
    // The outline is the run at its width: 20 m long, 2 m wide, closed.
    const xs = m.outline.map((p) => local(p).x)
    const ys = m.outline.map((p) => local(p).y)
    expect(Math.min(...xs)).toBeCloseTo(20, 3)
    expect(Math.max(...xs)).toBeCloseTo(40, 3)
    expect(Math.min(...ys)).toBeCloseTo(4, 3)
    expect(Math.max(...ys)).toBeCloseTo(6, 3)
    expect(m.outline[0]).toEqual(m.outline[m.outline.length - 1])
    // Each step line spans the width.
    const [a, b] = m.steps[0]
    expect(Math.abs(local(a).y - local(b).y)).toBeCloseTo(2, 3)
  })

  it('the arrow has a head at its uphill tip, its wings behind the tip', () => {
    const d = campus()
    const m = stairMarking(d, d.structures![0])!
    const [left, tip, right] = m.arrowHead
    expect(tip).toEqual(m.arrow[1])
    // Uphill is towards the building (−x): the wings sit on the downhill (+x) side of the tip, one each side.
    expect(local(left).x).toBeGreaterThan(local(tip).x)
    expect(local(right).x).toBeGreaterThan(local(tip).x)
    expect(Math.sign(local(left).y - local(tip).y)).toBe(-Math.sign(local(right).y - local(tip).y))
  })

  it('a ramp marking has no step lines', () => {
    const d = campus('ramp')
    const m = stairMarking(d, d.structures![0])!
    expect(m.steps).toEqual([])
    expect(m.arrow).toHaveLength(2)
  })
})
