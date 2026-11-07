import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import type { Building } from '../../types/entities'
import type { Structure } from '../../structures/types'
import { toLatLng, toLocal } from '../grid'
import type { TerrainGrid } from '../types'
import { stairRouteOf, suggestStairConnection } from '../stair-connection'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const local = (p: { lat: number; lng: number }) => toLocal(grid, p)
/** Building-local metres are campus-local metres in these tests. */
const toWorld = (_buildingId: string, _level: number, p: { x: number; y: number }) => ll(p.x, p.y)

interface Options {
  bottom?: Structure['end']
  entrance?: { x: number; y: number } | null
  routeNode?: { x: number; y: number } | null
  linkedTo?: string
  topOnRoad?: boolean
}

/** The Computer Science case: a stair from the lower road up the hall's east side to the 2F entrance. */
function campus(o: Options = {}): CampusDocument {
  const entrance = o.entrance === undefined ? { x: 19.5, y: 5 } : o.entrance
  const node = o.routeNode === undefined ? { x: 18, y: 5 } : o.routeNode
  const f2 = {
    id: 'f2', level: 1, label: '2F', elevation: 3, height: 3, rooms: [], hallways: [], staircases: [], elevators: [], connectorStops: [], parametricComponents: [], metadata: {},
    entrances: entrance ? [{ id: 'e2', label: 'East door', position: entrance, level: 1, type: 'main', hasQR: false, hasPanorama: false }] : [],
    ...(node ? { routeNetwork: { nodes: [{ id: 'n2', type: 'junction', position: node, floor: 1 }], edges: [] } } : {}),
    ...(o.linkedTo && entrance && node ? { entranceAccess: [{ entranceId: 'e2', outdoorNodeId: 'x', indoorRouteNodeId: 'n2', outdoorRouteId: o.linkedTo, outdoorPosition: ll(30, 30) }] } : {}),
  }
  const hall = {
    id: 'hall', name: 'Hall', code: 'H', category: 'academic', description: '', baseElevation: 0, height: 6,
    footprint: { points: [ll(0, 0), ll(20, 0), ll(20, 10), ll(0, 10), ll(0, 0)] },
    floors: [{ ...f2, id: 'f1', level: 0, label: '1F', elevation: 0, entrances: [], routeNetwork: undefined, entranceAccess: undefined }, f2],
    verticalConnectors: [], color: '#000', aliases: [], metadata: {},
  } as unknown as Building
  return {
    schemaVersion: 1, version: 0, metadata: {}, panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'Flat', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 10 } },
    boundary: { points: [ll(-50, -50), ll(100, -50), ll(100, 60), ll(-50, 60)] },
    buildings: [hall],
    roads: [
      { id: 'r1', name: 'Lower road', polyline: { points: [ll(40, -20), ll(40, 30)] }, width: 4, surface: 'paved', type: 'pedestrian', metadata: {} },
      { id: 'r2', name: 'Upper road', polyline: { points: [ll(-20, 40), ll(60, 40)] }, width: 4, surface: 'paved', type: 'pedestrian', metadata: {} },
    ],
    structures: [{
      id: 's1', form: 'stairs', presetId: 'p', width: 2, underneath: 'open', railings: 'both',
      start: o.topOnRoad
        ? { kind: 'road', roadId: 'r2', position: ll(30, 40), }
        : { kind: 'slab', buildingId: 'hall', floorId: 'f2', edgeIndex: 1, edgeT: 0.5 },
      end: o.bottom ?? { kind: 'road', roadId: 'r1', position: ll(40.8, 5) },
      ...(o.topOnRoad ? { heightOverride: { start: 3 } } : {}),
    }],
  } as unknown as CampusDocument
}

describe('suggestStairConnection', () => {
  it('the bottom end suggests the road it touches (projected onto its centre line)', () => {
    const s = suggestStairConnection(campus(), 's1', { toWorld })!
    expect(s.bottom?.roadId).toBe('r1')
    expect(s.bottom?.kind).toBe('road-segment')
    expect(local(s.bottom!.position).x).toBeCloseTo(40, 3)
    expect(local(s.bottom!.position).y).toBeCloseTo(5, 1)
    // The centre line runs bottom (road) → top (building).
    expect(local(s.centreline[0]).x).toBeCloseTo(40.8, 1)
    expect(local(s.centreline[s.centreline.length - 1]).x).toBeCloseTo(20, 3)
  })

  it('a ground bottom end suggests nothing', () => {
    const s = suggestStairConnection(campus({ bottom: { kind: 'ground', position: ll(32, 5) } }), 's1', { toWorld })!
    expect(s.bottom).toBeNull()
  })

  it('the top end suggests the entrance on that floor within 3 m and its indoor route node', () => {
    const s = suggestStairConnection(campus(), 's1', { toWorld })!
    expect(s.top).toEqual({ kind: 'entrance', buildingId: 'hall', floorId: 'f2', entranceId: 'e2', indoorRouteNodeId: 'n2' })
  })

  it('an entrance already linked to a road reports replacesRoadId', () => {
    const s = suggestStairConnection(campus({ linkedTo: 'r2' }), 's1', { toWorld })!
    expect(s.top).toMatchObject({ kind: 'entrance', entranceId: 'e2', indoorRouteNodeId: 'n2', replacesRoadId: 'r2' })
  })

  it('no entrance near the top end → missing entrance', () => {
    const s = suggestStairConnection(campus({ entrance: { x: 10, y: 9 } }), 's1', { toWorld })!
    expect(s.top).toEqual({ kind: 'missing', reason: 'entrance', buildingId: 'hall', floorId: 'f2' })
  })

  it('an entrance with no route node within 3 m → missing indoor-route', () => {
    const s = suggestStairConnection(campus({ routeNode: { x: 5, y: 5 } }), 's1', { toWorld })!
    expect(s.top).toEqual({ kind: 'missing', reason: 'indoor-route', buildingId: 'hall', floorId: 'f2' })
  })

  it('a road-to-road stair suggests a route at both ends', () => {
    const s = suggestStairConnection(campus({ topOnRoad: true }), 's1', { toWorld })!
    expect(s.bottom?.roadId).toBe('r1')
    expect(s.top).toMatchObject({ kind: 'route', route: { roadId: 'r2', kind: 'road-segment' } })
  })

  it('an unknown stair gives null', () => {
    expect(suggestStairConnection(campus(), 'nope', { toWorld })).toBeNull()
  })
})

describe('stairRouteOf', () => {
  it('finds the road made for a stair', () => {
    const d = campus()
    expect(stairRouteOf(d, 's1')).toBeNull()
    d.roads.push({ id: 'rs', name: '', polyline: { points: [ll(40, 5), ll(20, 5)] }, width: 2, surface: 'paved', type: 'pedestrian', routing: { feature: 'stairs', structureId: 's1' }, metadata: {} } as never)
    expect(stairRouteOf(d, 's1')?.id).toBe('rs')
  })
})
