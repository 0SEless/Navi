import { describe, it, expect } from 'vitest'
import { createDocument } from './create-editor-context'
import { CoordinateTransformer } from '@navi/core'

// ── P0 T0.3 migration tests ──
// Legacy per-floor records (floor.staircases / floor.elevators /
// floor.parametricComponents) must be minted into building-level feature
// entities by createDocument: one feature per record, single-level, id
// preserved, fromLevel/toLevel per record, and (for parametric records) a
// drawing + resolved polygon via the T0.4 bridge.

interface RawFloorRecord {
  level: number
  staircases?: Array<{
    id: string
    name?: string
    position?: { x: number; y: number }
    fromLevel?: number
    toLevel?: number
    type?: string
  }>
  elevators?: Array<{
    id: string
    name?: string
    position?: { x: number; y: number }
    fromLevel?: number
    toLevel?: number
  }>
  parametricComponents?: Array<{
    id?: string
    definitionId?: string
    position?: { x: number; y: number }
    rotation?: number
    properties?: Record<string, unknown>
  }>
  rooms?: Array<{ id: string; name?: string; number?: string; polygon?: { points: Array<{ x: number; y: number }> } }>
  hallways?: Array<{ id: string; name?: string; polyline?: { points: Array<{ x: number; y: number }> }; width?: number; color?: string }>
  entrances?: Array<{ id: string; name?: string; position?: { lat: number; lng: number }; type?: string }>
}

function makeGraph(floors: RawFloorRecord[], buildingExtras: Record<string, unknown> = {}): {
  campusId: string
  name: string
  buildings: Array<Record<string, unknown>>
  components: unknown[]
  nodes: unknown[]
  edges: unknown[]
  traces: unknown[]
} {
  return {
    campusId: 'c1',
    name: 'Test Campus',
    buildings: [
      {
        id: 'b1',
        name: 'Building 1',
        code: 'B1',
        category: 'academic',
        description: 'desc',
        baseElevation: 3,
        height: 24,
        footprint: { points: [{ lat: 33.42, lng: -111.93 }, { lat: 33.4201, lng: -111.93 }, { lat: 33.4201, lng: -111.9299 }, { lat: 33.42, lng: -111.9299 }] },
        floors,
        ...buildingExtras,
      },
    ],
    components: [],
    nodes: [],
    edges: [],
    traces: [],
  }
}

describe('createDocument — T0.3 migration: legacy staircases → features', () => {
  it('mints one feature per legacy record, one level each, ids preserved, fromLevel/toLevel and position carried', () => {
    const graph = makeGraph([
      {
        level: 0,
        staircases: [
          { id: 'stair-main-g-a', name: 'Main Stairs A', position: { x: 10, y: 20 }, fromLevel: 0, toLevel: 1, type: 'open' },
        ],
      },
      {
        level: 1,
        staircases: [
          { id: 'stair-main-1-a', name: 'Main Stairs A', position: { x: 10, y: 21 }, fromLevel: 0, toLevel: 1, type: 'open' },
        ],
      },
    ])
    const doc = createDocument(graph)
    const features = doc.buildings[0].staircases!
    expect(features).toHaveLength(2)

    const f0 = features.find((f) => f.id === 'stair-main-g-a')!
    expect(f0.buildingId).toBe('b1')
    expect(f0.name).toBe('Main Stairs A')
    expect(f0.type).toBe('open')
    expect(f0.accessible).toBe(false)
    expect(f0.fromLevel).toBe(0)
    expect(f0.toLevel).toBe(1)
    expect(Object.keys(f0.levels)).toEqual(['0'])
    expect(f0.levels[0]).toEqual({ position: { x: 10, y: 20 }, rotation: 0 })

    const f1 = features.find((f) => f.id === 'stair-main-1-a')!
    expect(f1.fromLevel).toBe(0)
    expect(f1.toLevel).toBe(1)
    expect(Object.keys(f1.levels)).toEqual(['1'])
    expect(f1.levels[1]).toEqual({ position: { x: 10, y: 21 }, rotation: 0 })
  })

  it('mints features from graph components of type stair (component id → feature id, range → from/to)', () => {
    const transformer = new CoordinateTransformer()
    transformer.registerBuilding({ buildingId: 'b1', origin: { lat: 33.42, lng: -111.93 }, rotation: 0 })
    const graph = makeGraph([{ level: 0 }])
    graph.components = [
      { id: 'comp-stair-1', type: 'stair', name: 'North Stairs', buildingId: 'b1', floor: 0, position: { lat: 33.420005, lng: -111.93 }, range: { from: 0, to: 2 }, metadata: { type: 'open' } },
    ]
    const doc = createDocument(graph, transformer)
    const features = doc.buildings[0].staircases!
    expect(features).toHaveLength(1)
    const f = features[0]
    expect(f.id).toBe('comp-stair-1')
    expect(f.buildingId).toBe('b1')
    expect(f.name).toBe('North Stairs')
    expect(f.type).toBe('open')
    expect(f.fromLevel).toBe(0)
    expect(f.toLevel).toBe(2)
    expect(Object.keys(f.levels)).toEqual(['0'])
    expect(f.levels[0].position).toEqual(transformer.worldToBuildingLocal({ lat: 33.420005, lng: -111.93 }, 'b1'))
    expect(f.levels[0].rotation).toBe(0)
  })
})

describe('createDocument — T0.3 migration: legacy elevators → features', () => {
  it('mints one feature per legacy elevator record with from/to carried', () => {
    const graph = makeGraph([
      {
        level: 0,
        elevators: [
          { id: 'elev-main-g', name: 'Main Elevator', position: { x: 30, y: 40 }, fromLevel: 0, toLevel: 3 },
        ],
      },
    ])
    const doc = createDocument(graph)
    const features = doc.buildings[0].elevators!
    expect(features).toHaveLength(1)
    const f = features[0]
    expect(f.id).toBe('elev-main-g')
    expect(f.buildingId).toBe('b1')
    expect(f.name).toBe('Main Elevator')
    expect(f.type).toBe('passenger')
    expect(f.accessible).toBe(false)
    expect(f.fromLevel).toBe(0)
    expect(f.toLevel).toBe(3)
    expect(Object.keys(f.levels)).toEqual(['0'])
    expect(f.levels[0]).toEqual({ position: { x: 30, y: 40 }, rotation: 0 })
  })

  it('uses the floor level for both ends when the legacy elevator lacks from/to', () => {
    const graph = makeGraph([
      { level: 2, elevators: [{ id: 'elev-no-range', name: 'Elev No Range', position: { x: 1, y: 2 } }] },
    ])
    const doc = createDocument(graph)
    const f = doc.buildings[0].elevators![0]
    expect(f.id).toBe('elev-no-range')
    expect(f.fromLevel).toBe(2)
    expect(f.toLevel).toBe(2)
    expect(Object.keys(f.levels)).toEqual(['2'])
  })
})

describe('createDocument — T0.3 migration: parametric components → features with drawing + resolved polygon', () => {
  it('mints a stair feature with drawing and the exact resolved polygon (matches T0.4 math)', () => {
    const graph = makeGraph([
      {
        level: 0,
        parametricComponents: [
          {
            id: 'pc-stair-0',
            definitionId: 'stair',
            position: { x: 10, y: 20 },
            rotation: 0,
            properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' },
          },
        ],
      },
    ])
    const doc = createDocument(graph)
    const features = doc.buildings[0].staircases!
    expect(features).toHaveLength(1)
    const f = features[0]
    expect(f.id).toBe('pc-stair-0')
    expect(f.buildingId).toBe('b1')
    expect(f.type).toBe('open')
    expect(f.fromLevel).toBe(0)
    expect(f.toLevel).toBe(0)
    expect(f.levels[0].position).toEqual({ x: 10, y: 20 })
    expect(f.levels[0].rotation).toBe(0)
    expect(f.levels[0].drawing).toEqual({
      definitionId: 'stair',
      properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' },
    })
    // stepWidth 2, stepCount*stepDepth 2 → 2x2 rect at (10,20), rotation 0
    expect(f.levels[0].polygon).toEqual({
      points: [
        { x: 11, y: 21 },
        { x: 9, y: 21 },
        { x: 9, y: 19 },
        { x: 11, y: 19 },
        { x: 11, y: 21 },
      ],
    })
  })

  it('mints an elevator feature with drawing and the resolved polygon', () => {
    const graph = makeGraph([
      {
        level: 0,
        parametricComponents: [
          {
            id: 'pc-elev-0',
            definitionId: 'elevator',
            position: { x: 5, y: 5 },
            rotation: 0,
            properties: { width: 1.5, depth: 1.5, doorSide: 'front' },
          },
        ],
      },
    ])
    const doc = createDocument(graph)
    const features = doc.buildings[0].elevators!
    expect(features).toHaveLength(1)
    const f = features[0]
    expect(f.id).toBe('pc-elev-0')
    expect(f.type).toBe('passenger')
    expect(f.levels[0].drawing).toEqual({
      definitionId: 'elevator',
      properties: { width: 1.5, depth: 1.5, doorSide: 'front' },
    })
    expect(f.levels[0].polygon).toEqual({
      points: [
        { x: 5.75, y: 5.75 },
        { x: 4.25, y: 5.75 },
        { x: 4.25, y: 4.25 },
        { x: 5.75, y: 4.25 },
        { x: 5.75, y: 5.75 },
      ],
    })
  })

  it('honors the parametric rotation when deriving the polygon', () => {
    const graph = makeGraph([
      {
        level: 0,
        parametricComponents: [
          {
            id: 'pc-stair-rot',
            definitionId: 'stair',
            position: { x: 10, y: 20 },
            rotation: 90,
            properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' },
          },
        ],
      },
    ])
    const doc = createDocument(graph)
    const f = doc.buildings[0].staircases![0]
    expect(f.levels[0].polygon).toEqual({
      points: [
        { x: 9, y: 21 },
        { x: 9, y: 19 },
        { x: 11, y: 19 },
        { x: 11, y: 21 },
        { x: 9, y: 21 },
      ],
    })
  })

  it('skips parametric records with unknown definitionIds', () => {
    const graph = makeGraph([
      {
        level: 0,
        parametricComponents: [{ id: 'pc-weird', definitionId: 'ramp', position: { x: 0, y: 0 }, rotation: 0, properties: {} }],
      },
    ])
    const doc = createDocument(graph)
    expect(doc.buildings[0].staircases ?? []).toHaveLength(0)
    expect(doc.buildings[0].elevators ?? []).toHaveLength(0)
  })
})

describe('createDocument — T0.3 migration: new-shape input wins', () => {
  it('uses new-shape features verbatim and does not mint from legacy arrays', () => {
    const newStair = {
      id: 'new-stair-1',
      buildingId: 'b1',
      name: 'New Stair',
      type: 'open',
      accessible: true,
      fromLevel: 0,
      toLevel: 2,
      levels: {
        0: { position: { x: 1, y: 1 }, rotation: 0 },
        2: { position: { x: 2, y: 2 }, rotation: 0 },
      },
    }
    const graph = makeGraph([
      { level: 0, staircases: [{ id: 'legacy-stair-x', name: 'Legacy', position: { x: 9, y: 9 }, fromLevel: 0, toLevel: 1, type: 'open' }] },
    ], { staircases: [newStair] })
    const doc = createDocument(graph)
    const features = doc.buildings[0].staircases!
    expect(features).toHaveLength(1)
    expect(features[0]).toEqual(newStair)
    expect(features[0].id).toBe('new-stair-1')
  })

  it('uses new-shape elevators verbatim and does not mint from legacy arrays', () => {
    const newElev = {
      id: 'new-elev-1',
      buildingId: 'b1',
      name: 'New Elev',
      type: 'passenger',
      accessible: true,
      fromLevel: 0,
      toLevel: 1,
      levels: { 0: { position: { x: 3, y: 3 }, rotation: 0 } },
    }
    const graph = makeGraph([
      { level: 0, elevators: [{ id: 'legacy-elev-x', name: 'Legacy', position: { x: 9, y: 9 }, fromLevel: 0, toLevel: 1 }] },
    ], { elevators: [newElev] })
    const doc = createDocument(graph)
    const features = doc.buildings[0].elevators!
    expect(features).toHaveLength(1)
    expect(features[0]).toEqual(newElev)
    expect(features[0].id).toBe('new-elev-1')
  })
})

describe('createDocument — T0.3 migration: zero data loss', () => {
  it('leaves rooms/hallways/entrances/floors/building fields untouched while minting features', () => {
    const graph = makeGraph([
      {
        level: 0,
        rooms: [{ id: 'rm-101', name: 'Room 101', number: '101', polygon: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 0 }] } }],
        hallways: [{ id: 'hw-main', name: 'Main Hall', polyline: { points: [{ x: 0, y: 2 }, { x: 10, y: 2 }] }, width: 3, color: '#fff' }],
        entrances: [{ id: 'ent-1', name: 'Main Entrance', position: { lat: 33.42, lng: -111.93 }, type: 'main' }],
        staircases: [{ id: 'stair-a', name: 'Stair A', position: { x: 2, y: 2 }, fromLevel: 0, toLevel: 1, type: 'open' }],
      },
    ])
    const doc = createDocument(graph)
    const b = doc.buildings[0]
    expect(b.id).toBe('b1')
    expect(b.name).toBe('Building 1')
    expect(b.code).toBe('B1')
    expect(b.category).toBe('academic')
    expect(b.description).toBe('desc')
    expect(b.baseElevation).toBe(3)
    expect(b.height).toBe(24)
    expect(b.floors).toHaveLength(1)
    const floor = b.floors[0]
    expect(floor.rooms.map((r) => r.id)).toEqual(['rm-101'])
    expect(floor.hallways.map((h) => h.id)).toEqual(['hw-main'])
    expect(floor.entrances.map((e) => e.id)).toEqual(['ent-1'])
    expect(floor.staircases.map((s) => s.id)).toEqual(['stair-a'])
    // nothing new writes parametricComponents
    expect(floor.parametricComponents).toEqual([])
    expect(b.staircases!.map((s) => s.id)).toEqual(['stair-a'])
  })

  it('is deterministic across reloads — same graph yields identical features', () => {
    const graph = makeGraph([
      {
        level: 0,
        staircases: [{ id: 'stair-x', name: 'X', position: { x: 1, y: 1 }, fromLevel: 0, toLevel: 1, type: 'open' }],
        elevators: [{ id: 'elev-x', name: 'X', position: { x: 2, y: 2 }, fromLevel: 0, toLevel: 2 }],
        parametricComponents: [
          { id: 'pc-x', definitionId: 'stair', position: { x: 3, y: 3 }, rotation: 0, properties: { stepCount: 4, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'straight' } },
        ],
      },
    ])
    const a = createDocument(graph)
    const b = createDocument(graph)
    expect(JSON.parse(JSON.stringify(a.buildings[0].staircases))).toEqual(JSON.parse(JSON.stringify(b.buildings[0].staircases)))
    expect(JSON.parse(JSON.stringify(a.buildings[0].elevators))).toEqual(JSON.parse(JSON.stringify(b.buildings[0].elevators)))
  })
})
