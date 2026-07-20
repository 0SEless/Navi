import { describe, it, expect } from 'vitest'
import { CampusCompiler } from '../pipeline/campus-compiler'
import type { CampusDocument } from '@navi/core'
import type { CompileResultV2 } from '../types'

function demoCampus(overrides?: Partial<CampusDocument>): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { name: 'demo-univ', description: 'Demo campus', lastModified: '', editorVersion: '1.0' },
    buildings: [
      {
        id: 'bld-a',
        name: 'Building A',
        code: 'BLA',
        category: 'academic',
        description: 'Main academic building',
        footprint: { points: [{ lat: 14.0, lng: 121.0 }, { lat: 14.001, lng: 121.0 }, { lat: 14.001, lng: 121.001 }, { lat: 14.0, lng: 121.001 }] },
        baseElevation: 10,
        height: 20,
        floors: [
          {
            id: 'bld-a-f1',
            level: 1,
            label: 'First Floor',
            elevation: 0,
            rooms: [
              {
                id: 'a101',
                name: 'Room 101',
                number: '101',
                category: 'classroom',
                polygon: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
                roomDoors: [
                  { id: 'a101-d1', roomId: 'a101', connectedToId: 'hw-a1', connectedToType: 'hallway', doorType: 'standard', position: { x: 5, y: 10 }, width: 1.5, metadata: {} },
                ],
                metadata: {},
              },
              {
                id: 'a102',
                name: 'Room 102',
                number: '102',
                category: 'lab',
                polygon: { points: [{ x: 12, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 10 }, { x: 12, y: 10 }] },
                roomDoors: [],
                metadata: {},
              },
            ],
            hallways: [
              { id: 'hw-a1', name: 'Main Hallway A', polyline: { points: [{ x: 0, y: 5 }, { x: 25, y: 5 }] }, width: 3 },
            ],
            staircases: [],
            elevators: [],
            entrances: [
              { id: 'a-ent-1', label: 'Main Entrance A', position: { lat: 14.0, lng: 121.0 }, level: 1, type: 'main', hasQR: false, hasPanorama: false },
            ],
            connectorStops: [
              { id: 'stop-a-stair-1', connectorId: 'conn-stair-a', label: 'Stair Landing', position: { x: 25, y: 5 }, rotation: 0, accessible: true, anchors: [], metadata: {} },
            ],
            metadata: {},
          },
          {
            id: 'bld-a-f2',
            level: 2,
            label: 'Second Floor',
            elevation: 4,
            rooms: [
              {
                id: 'a201',
                name: 'Room 201',
                number: '201',
                category: 'office',
                polygon: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
                roomDoors: [
                  { id: 'a201-d1', roomId: 'a201', connectedToId: 'hw-a2', connectedToType: 'hallway', doorType: 'standard', position: { x: 5, y: 10 }, width: 1.5, metadata: {} },
                ],
                metadata: {},
              },
            ],
            hallways: [
              { id: 'hw-a2', name: 'Upper Hallway A', polyline: { points: [{ x: 0, y: 5 }, { x: 25, y: 5 }] }, width: 3 },
            ],
            staircases: [],
            elevators: [],
            entrances: [],
            connectorStops: [
              { id: 'stop-a-stair-2', connectorId: 'conn-stair-a', label: 'Stair Landing 2', position: { x: 25, y: 5 }, rotation: 0, accessible: true, anchors: [], metadata: {} },
            ],
            metadata: {},
          },
        ],
        verticalConnectors: [
          { id: 'conn-stair-a', type: 'staircase', name: 'Stairwell A', stopIds: ['stop-a-stair-1', 'stop-a-stair-2'], accessible: true, metadata: {} },
        ],
        aliases: [],
        color: '#ff0000',
        metadata: {},
      },
      {
        id: 'bld-b',
        name: 'Building B',
        code: 'BLB',
        category: 'library',
        description: 'Library building',
        footprint: { points: [{ lat: 14.005, lng: 121.005 }, { lat: 14.006, lng: 121.005 }, { lat: 14.006, lng: 121.006 }, { lat: 14.005, lng: 121.006 }] },
        baseElevation: 12,
        height: 15,
        floors: [
          {
            id: 'bld-b-f1',
            level: 1,
            label: 'Ground Floor',
            elevation: 0,
            rooms: [
              {
                id: 'b001',
                name: 'Reading Room',
                number: '001',
                category: 'other',
                polygon: { points: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 12 }, { x: 0, y: 12 }] },
                roomDoors: [
                  { id: 'b001-d1', roomId: 'b001', connectedToId: 'hw-b1', connectedToType: 'hallway', doorType: 'double', position: { x: 7.5, y: 12 }, width: 2, metadata: {} },
                ],
                metadata: {},
              },
            ],
            hallways: [
              { id: 'hw-b1', name: 'Library Hallway', polyline: { points: [{ x: 0, y: 6 }, { x: 20, y: 6 }] }, width: 4 },
            ],
            staircases: [],
            elevators: [],
            entrances: [
              { id: 'b-ent-1', label: 'Library Entrance', position: { lat: 14.005, lng: 121.005 }, level: 1, type: 'main', hasQR: true, hasPanorama: false },
            ],
            connectorStops: [
              { id: 'stop-b-elev-1', connectorId: 'conn-elev-b', label: 'Elevator Lobby', position: { x: 20, y: 6 }, rotation: 0, accessible: true, anchors: [
                { id: 'b-elev-pano', label: 'Elevator Area', position: { x: 20, y: 7 }, heading: 90, imageAssetId: 'pano-elev-b', hotspots: [] },
              ], metadata: {} },
            ],
            metadata: {},
          },
          {
            id: 'bld-b-f2',
            level: 2,
            label: 'Upper Floor',
            elevation: 4,
            rooms: [
              {
                id: 'b002',
                name: 'Study Room',
                number: '002',
                category: 'other',
                polygon: { points: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 12 }, { x: 0, y: 12 }] },
                roomDoors: [
                  { id: 'b002-d1', roomId: 'b002', connectedToId: 'hw-b2', connectedToType: 'hallway', doorType: 'standard', position: { x: 7.5, y: 12 }, width: 1.5, metadata: {} },
                ],
                metadata: {},
              },
            ],
            hallways: [
              { id: 'hw-b2', name: 'Upper Library Hallway', polyline: { points: [{ x: 0, y: 6 }, { x: 20, y: 6 }] }, width: 4 },
            ],
            staircases: [],
            elevators: [],
            entrances: [],
            connectorStops: [
              { id: 'stop-b-elev-2', connectorId: 'conn-elev-b', label: 'Upper Elevator', position: { x: 20, y: 6 }, rotation: 0, accessible: true, anchors: [], metadata: {} },
            ],
            metadata: {},
          },
        ],
        verticalConnectors: [
          { id: 'conn-elev-b', type: 'elevator', name: 'Elevator B', stopIds: ['stop-b-elev-1', 'stop-b-elev-2'], accessible: true, metadata: {} },
        ],
        aliases: [],
        color: '#0000ff',
        metadata: {},
      },
    ],
    roads: [
      { id: 'road-1', name: 'Campus Path', polyline: { points: [{ lat: 14.0, lng: 121.0 }, { lat: 14.005, lng: 121.005 }] }, width: 5, surface: 'paved', type: 'connector', metadata: {} },
    ],
    panoramas: [],
    qrCheckpoints: [],
    ...overrides,
  }
}

describe('compileV2 integration', () => {
  it('completes the full pipeline and returns CompileResultV2 with all fields', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    expect(result.success).toBe(true)
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(result.graph).not.toBeNull()
    expect(result.report).toBeDefined()
    expect(result.artifacts).toBeDefined()
    expect(result.stats).toBeDefined()
  })

  it('produces a non-empty navigation graph', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    expect(result.graph!.nodes.length).toBeGreaterThan(0)
    expect(result.graph!.edges.length).toBeGreaterThan(0)
  })

  it('produces NavigationArtifacts with all 5 fields and empty extensions', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    const arts = result.artifacts!
    expect(arts).toHaveProperty('graph')
    expect(arts).toHaveProperty('searchIndex')
    expect(arts).toHaveProperty('spatialIndex')
    expect(arts).toHaveProperty('buildingIndex')
    expect(arts).toHaveProperty('poiIndex')
    expect(arts.extensions).toEqual({})
  })

  it('populates report statistics with correct entity counts', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    const stats = result.report!.statistics
    expect(stats.rooms).toBeGreaterThan(0)
    expect(stats.waypoints).toBeGreaterThan(0)
    expect(stats.edges).toBeGreaterThan(0)
    expect(stats.primitives).toBeGreaterThan(0)
    expect(stats.compileTime).toBeGreaterThanOrEqual(0)
    expect(stats.diagnostics).toBeDefined()
  })

  it('includes all NavNode types (waypoint, poi, transition, outdoor, entrance)', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)
    const types = new Set(result.graph!.nodes.map(n => n.type))

    expect(types.has('waypoint')).toBe(true)
    expect(types.has('poi')).toBe(true)
    expect(types.has('transition')).toBe(true)
    expect(types.has('outdoor')).toBe(true)
    expect(types.has('entrance')).toBe(true)
  })

  it('includes all NavEdge types (walk, stairs, elevator, transition)', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)
    const types = new Set(result.graph!.edges.map(e => e.type))

    expect(types.has('walk')).toBe(true)
    expect(types.has('stairs')).toBe(true)
    expect(types.has('elevator')).toBe(true)
  })

  it('returns searchIndex entries for indexed nodes', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    expect(result.artifacts!.searchIndex.entries.length).toBeGreaterThan(0)
    expect(result.artifacts!.searchIndex.version).toBe('1.0.0')
  })

  it('returns spatialIndex with grid cells', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    expect(result.artifacts!.spatialIndex.cellSize).toBe(0.001)
    expect(Object.keys(result.artifacts!.spatialIndex.cells).length).toBeGreaterThan(0)
  })

  it('returns buildingIndex with building entries', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    const ids = result.artifacts!.buildingIndex.buildings.map(b => b.id)
    expect(ids).toContain('bld-a')
    expect(ids).toContain('bld-b')
  })

  it('returns poiIndex with POI points', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    expect(result.artifacts!.poiIndex.points.length).toBeGreaterThan(0)
    expect(result.artifacts!.poiIndex.version).toBe('1.0.0')
  })

  it('handles structural errors gracefully (no-footprint building)', () => {
    const doc = demoCampus()
    doc.buildings[0]!.footprint = { points: [] }
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    // Pipeline halts on structural errors — graph is null, errors reported
    expect(result.success).toBe(false)
    expect(result.graph).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.code === 'BUILDING_NO_FOOTPRINT')).toBe(true)
  })

  it('compilesV2 returns stats with connectivity score', () => {
    const doc = demoCampus()
    const compiler = new CampusCompiler({ nodeInterval: 10, mergeThreshold: 0.5 } as any)
    const result = compiler.compileV2(doc)

    expect(result.stats.connectivityScore).toBeGreaterThan(0)
    expect(result.stats.totalNodes).toBe(result.graph!.nodes.length)
    expect(result.stats.totalEdges).toBe(result.graph!.edges.length)
  })
})
