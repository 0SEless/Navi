import { describe, it, expect } from 'vitest'
import { serializeDocument, deserializeDocument, roundTrip, SCHEMA_VERSION } from './serializer'
import type { CampusDocument, Staircase, Elevator, BuildingCategory } from '../types'

function makeBaseDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 0,
    metadata: {
      campusId: 'ASU Ibajay',
      name: 'ASU Ibajay',
      description: 'Test campus',
      lastModified: new Date('2026-07-08').toISOString(),
      editorVersion: '0.1.0',
    },
    buildings: [
      {
        id: 'bld-1',
        name: 'Main Building',
        code: 'MAIN',
        category: 'academic' as BuildingCategory,
        description: 'Main academic building',
        footprint: {
          points: [
            { lat: 33.42, lng: -111.93 },
            { lat: 33.43, lng: -111.93 },
            { lat: 33.43, lng: -111.92 },
            { lat: 33.42, lng: -111.92 },
            { lat: 33.42, lng: -111.93 },
          ],
        },
        baseElevation: 0,
        height: 15,
        floors: [
          {
            id: 'flr-0',
            level: 0,
            label: 'Ground Floor',
            elevation: 0,
            height: 3.5,
            rooms: [],
            hallways: [],
            staircases: [],
            elevators: [],
            entrances: [],
            connectorStops: [],
            parametricComponents: [],
            metadata: {},
          },
          {
            id: 'flr-1',
            level: 1,
            label: 'First Floor',
            elevation: 3.5,
            height: 3.5,
            rooms: [],
            hallways: [],
            staircases: [],
            elevators: [],
            entrances: [],
            connectorStops: [],
            parametricComponents: [],
            metadata: {},
          },
        ],
        verticalConnectors: [],
        color: '#336699',
        aliases: [],
        metadata: {},
      },
    ],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

function makeStaircase(): Staircase {
  return {
    id: 'stair-main',
    buildingId: 'bld-1',
    name: 'Stairwell A',
    type: 'enclosed',
    accessible: true,
    fromLevel: 0,
    toLevel: 2,
    levels: {
      0: {
        position: { x: 2.5, y: 1.5 },
        rotation: 0,
        polygon: {
          points: [
            { x: 2, y: 1 },
            { x: 3, y: 1 },
            { x: 3, y: 2 },
            { x: 2, y: 2 },
            { x: 2, y: 1 },
          ],
        },
        drawing: {
          definitionId: 'stair',
          properties: {
            stepCount: 12,
            stepWidth: 1.2,
            stepDepth: 0.28,
            direction: 'up-north',
            preset: 'straight',
          },
        },
      },
      1: {
        position: { x: 3.5, y: 2.5 },
        rotation: 90,
        landing: {
          position: { x: 4, y: 3 },
          rotation: 180,
          polygon: {
            points: [
              { x: 3.5, y: 2.5 },
              { x: 4.5, y: 2.5 },
              { x: 4.5, y: 3.5 },
              { x: 3.5, y: 3.5 },
              { x: 3.5, y: 2.5 },
            ],
          },
        },
      },
      2: {
        position: { x: 4.5, y: 3.5 },
        rotation: 45,
        polygon: {
          points: [
            { x: 4, y: 3 },
            { x: 5, y: 3 },
            { x: 5, y: 4 },
            { x: 4, y: 4 },
            { x: 4, y: 3 },
          ],
        },
      },
    },
  }
}

function makeElevator(): Elevator {
  return {
    id: 'elev-main',
    buildingId: 'bld-1',
    name: 'Main Elevator',
    type: 'passenger',
    accessible: true,
    fromLevel: -1,
    toLevel: 2,
    levels: {
      [-1]: {
        position: { x: 10, y: 10 },
        rotation: 0,
        polygon: {
          points: [
            { x: 9.5, y: 9.5 },
            { x: 12, y: 9.5 },
            { x: 12, y: 11.5 },
            { x: 9.5, y: 11.5 },
            { x: 9.5, y: 9.5 },
          ],
        },
        drawing: {
          definitionId: 'elevator',
          properties: { width: 2.4, depth: 2.0, doorSide: 'east' },
        },
      },
      1: {
        position: { x: 11, y: 10 },
        rotation: 0,
      },
    },
  }
}

function makeFeatureDoc(): CampusDocument {
  const doc = makeBaseDoc()
  doc.schemaVersion = SCHEMA_VERSION
  doc.buildings[0].staircases = [makeStaircase()]
  doc.buildings[0].elevators = [makeElevator()]
  return doc
}

describe('serialization — Staircase/Elevator feature entities', () => {
  it('round-trips a 3-level staircase + elevator with every field intact', () => {
    const doc = makeFeatureDoc()
    const json = serializeDocument(doc)
    const restored = deserializeDocument(json)

    const srcStair = doc.buildings[0].staircases![0]
    const srcElev = doc.buildings[0].elevators![0]
    const stair = restored.buildings[0].staircases![0]
    const elev = restored.buildings[0].elevators![0]

    expect(stair).toEqual(srcStair)
    expect(elev).toEqual(srcElev)

    expect(stair.levels[0].drawing).toEqual(srcStair.levels[0].drawing)
    expect(stair.levels[1].landing).toEqual(srcStair.levels[1].landing)
    expect(stair.levels[1].landing!.polygon!.points).toHaveLength(5)
    expect(stair.levels[2].polygon).toEqual(srcStair.levels[2].polygon)
    expect(elev.levels[-1].drawing!.properties).toEqual({ width: 2.4, depth: 2.0, doorSide: 'east' })
  })

  it('mints single-level features from legacy per-floor arrays, ids preserved', () => {
    const doc = makeBaseDoc()
    const floor0 = doc.buildings[0].floors[0]
    const floor1 = doc.buildings[0].floors[1]
    floor0.staircases = [
      { id: 'stair-main-g-a', name: 'Stair A', position: { x: 1, y: 1 }, fromLevel: 0, toLevel: 1, type: 'enclosed' },
    ]
    floor1.staircases = [
      { id: 'stair-main-1-a', name: 'Stair A', position: { x: 1, y: 1 }, fromLevel: 0, toLevel: 1, type: 'open' },
    ]
    floor0.elevators = [
      { id: 'elev-main-g', name: 'Elev A', position: { x: 5, y: 5 }, fromLevel: 0, toLevel: 1 },
    ]
    floor1.elevators = [
      { id: 'elev-main-1', name: 'Elev A', position: { x: 5, y: 5 }, fromLevel: 0, toLevel: 1 },
    ]

    const restored = deserializeDocument(serializeDocument(doc))
    const bld = restored.buildings[0]

    expect(bld.staircases).toHaveLength(2)
    expect(bld.staircases![0]).toEqual({
      id: 'stair-main-g-a',
      buildingId: 'bld-1',
      name: 'Stair A',
      type: 'enclosed',
      accessible: false,
      fromLevel: 0,
      toLevel: 0,
      levels: { 0: { position: { x: 1, y: 1 }, rotation: 0 } },
    })
    expect(bld.staircases![1].id).toBe('stair-main-1-a')
    expect(bld.staircases![1].fromLevel).toBe(1)
    expect(bld.staircases![1].toLevel).toBe(1)
    expect(bld.staircases![1].type).toBe('open')

    expect(bld.elevators).toHaveLength(2)
    expect(bld.elevators![0]).toEqual({
      id: 'elev-main-g',
      buildingId: 'bld-1',
      name: 'Elev A',
      type: 'passenger',
      accessible: false,
      fromLevel: 0,
      toLevel: 0,
      levels: { 0: { position: { x: 5, y: 5 }, rotation: 0 } },
    })
    expect(bld.elevators![1].fromLevel).toBe(1)

    // Legacy floor arrays stay verbatim on read
    expect(restored.buildings[0].floors[0].staircases[0].id).toBe('stair-main-g-a')
    expect(restored.buildings[0].floors[1].elevators[0].id).toBe('elev-main-1')
  })

  it('feature arrays win when both shapes are present (legacy ignored)', () => {
    const doc = makeFeatureDoc()
    const floor0 = doc.buildings[0].floors[0]
    floor0.staircases = [
      { id: 'legacy-1', name: 'Legacy', position: { x: 9, y: 9 }, fromLevel: 0, toLevel: 0, type: 'emergency' },
    ]
    floor0.elevators = [
      { id: 'legacy-e1', name: 'Legacy Elev', position: { x: 8, y: 8 }, fromLevel: 0, toLevel: 0 },
    ]

    const restored = deserializeDocument(serializeDocument(doc))
    const bld = restored.buildings[0]

    // Features taken verbatim — no minted 'legacy-1' feature
    expect(bld.staircases).toHaveLength(1)
    expect(bld.staircases![0].id).toBe('stair-main')
    expect(bld.staircases![0].levels[2]).toBeDefined()
    expect(bld.elevators).toHaveLength(1)
    expect(bld.elevators![0].id).toBe('elev-main')

    // Features win: serialize regenerates the floor arrays from features
    // (authored legacy records are replaced by derived <featureId>-<level> ids)
    expect(bld.floors[0].staircases).toHaveLength(1)
    expect(bld.floors[0].staircases[0].id).toBe('stair-main-0')
    expect(bld.floors[0].staircases[0].id).not.toBe('legacy-1')
    expect(bld.floors[0].elevators).toEqual([])
  })

  it('derived legacy arrays are emitted with <featureId>-<level> ids and round-trip is stable', () => {
    const doc = makeFeatureDoc()
    const json = serializeDocument(doc)
    const parsed = JSON.parse(json) as CampusDocument

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION)
    const floor0 = parsed.buildings[0].floors[0]
    const floor1 = parsed.buildings[0].floors[1]

    expect(floor0.staircases).toEqual([
      {
        id: 'stair-main-0',
        name: 'Stairwell A',
        position: { x: 2.5, y: 1.5 },
        fromLevel: 0,
        toLevel: 2,
        type: 'enclosed',
      },
    ])
    expect(floor1.staircases).toEqual([
      {
        id: 'stair-main-1',
        name: 'Stairwell A',
        position: { x: 3.5, y: 2.5 },
        fromLevel: 0,
        toLevel: 2,
        type: 'enclosed',
      },
    ])
    // Elevator level -1 has no floor in this doc → floor 0 derived array is empty;
    // elevator level 1 lands on floor 1, and legacy elevator records carry no type
    expect(floor0.elevators).toEqual([])
    expect(floor1.elevators).toEqual([
      {
        id: 'elev-main-1',
        name: 'Main Elevator',
        position: { x: 11, y: 10 },
        fromLevel: -1,
        toLevel: 2,
      },
    ])
    expect(floor1.elevators[0]).not.toHaveProperty('type')

    // Round-trip stability for feature docs: serialize(deserialize(x)) === x
    const restored = deserializeDocument(json)
    expect(serializeDocument(restored)).toBe(json)
    expect(restored.buildings[0].staircases).toEqual(doc.buildings[0].staircases)
    expect(restored.buildings[0].elevators).toEqual(doc.buildings[0].elevators)
  })

  it('rejects invalid feature shapes', () => {
    const missingLevels = makeFeatureDoc()
    delete (missingLevels.buildings[0].staircases![0] as Partial<Staircase>).levels
    expect(() => deserializeDocument(serializeDocument(missingLevels))).toThrow(/levels/)

    const badRange = makeFeatureDoc()
    badRange.buildings[0].staircases![0].fromLevel = 3
    badRange.buildings[0].staircases![0].toLevel = 1
    expect(() => deserializeDocument(serializeDocument(badRange))).toThrow(/fromLevel/)

    const badKeys = makeFeatureDoc()
    badKeys.buildings[0].elevators![0].levels = {
      '1': { position: { x: 11, y: 10 }, rotation: 0 },
      'one': { position: { x: 12, y: 10 }, rotation: 0 },
    } as unknown as Elevator['levels']
    expect(() => deserializeDocument(serializeDocument(badKeys))).toThrow(/non-numeric/)

    const emptyLevels = makeFeatureDoc()
    emptyLevels.buildings[0].staircases![0].levels = {} as Staircase['levels']
    expect(() => deserializeDocument(serializeDocument(emptyLevels))).toThrow(/levels/)
  })

  it('backward compat: legacy-only and unversioned docs read as before; no dual-write without features', () => {
    const doc = makeBaseDoc()
    doc.buildings[0].floors[0].staircases = [
      { id: 'st-north', name: 'North Stairs', position: { x: 2, y: 2 }, fromLevel: 0, toLevel: 2, type: 'enclosed' },
    ]
    doc.buildings[0].floors[0].elevators = [
      { id: 'el-main', name: 'Main Elevator', position: { x: 8, y: 2 }, fromLevel: -1, toLevel: 3 },
    ]

    const json = serializeDocument(doc)
    // No features → no schemaVersion bump, no dual-write, no building feature arrays
    expect(JSON.parse(json).schemaVersion).toBe(1)
    expect(JSON.parse(json).buildings[0]).not.toHaveProperty('staircases')
    expect(JSON.parse(json).buildings[0].floors[0].staircases[0].id).toBe('st-north')

    const restored = deserializeDocument(json)
    expect(restored.schemaVersion).toBe(1)
    expect(restored.buildings[0].floors[0].staircases[0].id).toBe('st-north')
    expect(restored.buildings[0].floors[0].elevators[0].id).toBe('el-main')
    expect(roundTrip(doc).success).toBe(true)
  })

  it('treats unversioned docs as schemaVersion 1', () => {
    const doc = makeBaseDoc()
    const json = JSON.stringify(doc).replace(/"schemaVersion":\s*1,\s*/, '')
    const restored = deserializeDocument(json)
    expect(restored.schemaVersion).toBe(1)
  })
})
