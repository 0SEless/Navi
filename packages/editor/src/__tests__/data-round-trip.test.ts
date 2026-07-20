import { describe, it, expect } from 'vitest'
import { CoordinateTransformer, serializeDocument, deserializeDocument, roundTrip } from '@navi/core'
import type { CampusDocument, Building, Floor, Room, Hallway, Staircase, Elevator, Entrance, Road, Panorama, QRCheckpoint } from '@navi/core'
import { Graph } from '@/engine/graph'
import { GraphAdapter } from '../graph-adapter'
import { createDocument } from '../context/create-editor-context'

function makeFullDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 42,
    metadata: {
      name: 'ASU Polytechnic',
      description: 'Main campus for testing',
      lastModified: '2026-07-15T10:30:00.000Z',
      editorVersion: '1.0.0',
    },
    buildings: [
      {
        id: 'bld-eng',
        name: 'Engineering Building',
        code: 'ENG',
        category: 'academic',
        description: 'Houses CS and EE departments',
        department: 'Engineering',
        footprint: {
          points: [
            { lat: 33.42, lng: -111.93 },
            { lat: 33.421, lng: -111.93 },
            { lat: 33.421, lng: -111.929 },
            { lat: 33.42, lng: -111.929 },
            { lat: 33.42, lng: -111.93 },
          ],
        },
        baseElevation: 0,
        height: 25,
        color: '#336699',
        aliases: ['Eng', 'Engineering'],
        verticalConnectors: [],
        metadata: { built: 1998 },
        floors: [
          {
            id: 'flr-g',
            level: 0,
            label: 'Ground Floor',
            elevation: 0,
            planImageId: 'plan-g-001',
            textureId: 'tex-concrete',
            svgOverlayId: 'svg-floor-g',
            metadata: { wing: 'east' },
            rooms: [
              {
                id: 'rm-101',
                name: 'Room 101',
                number: '101',
                category: 'classroom',
                polygon: {
                  points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 8 },
                    { x: 0, y: 8 },
                    { x: 0, y: 0 },
                  ],
                },
                entrancePosition: { x: 5, y: 0 },
                capacity: 40,
                roomDoors: [],
                metadata: { projector: true, seats: 40 },
              },
            ],
            hallways: [
              {
                id: 'hw-main',
                name: 'Main Hallway',
                polyline: {
                  points: [
                    { x: 0, y: 4 },
                    { x: 10, y: 4 },
                  ],
                },
                width: 3,
                color: '#e0e0e0',
              },
            ],
            staircases: [
              {
                id: 'st-north',
                name: 'North Stairs',
                position: { x: 2, y: 2 },
                fromLevel: 0,
                toLevel: 2,
                type: 'enclosed',
              },
            ],
            elevators: [
              {
                id: 'el-main',
                name: 'Main Elevator',
                position: { x: 8, y: 2 },
                fromLevel: -1,
                toLevel: 3,
              },
            ],
            entrances: [
              {
                id: 'ent-main',
                label: 'Main Entrance',
                position: { lat: 33.4205, lng: -111.9295 },
                level: 0,
                type: 'main',
                hasQR: true,
                hasPanorama: true,
                connectorRoadId: 'road-main',
              },
            ],
            connectorStops: [],
          },
        ],
      },
    ],
    roads: [
      {
        id: 'road-main',
        name: 'Main Road',
        polyline: {
          points: [
            { lat: 33.42, lng: -111.93 },
            { lat: 33.421, lng: -111.929 },
          ],
        },
        width: 5,
        surface: 'paved',
        type: 'arterial',
        connectorEntranceId: 'ent-main',
        metadata: { lanes: 2 },
      },
    ],
    panoramas: [
      {
        id: 'pano-front',
        label: 'Front Gate View',
        position: { lat: 33.42, lng: -111.93 },
        heading: 180,
        imageAssetId: 'asset-pano-front-001',
        buildingId: 'bld-eng',
        floor: 0,
        hotspots: [
          {
            target: { type: 'entrance', targetId: 'ent-main' },
            position: { pitch: -10, yaw: 45 },
            label: 'Main Entrance',
          },
        ],
      },
    ],
    qrCheckpoints: [
      {
        id: 'qr-entrance',
        label: 'Engineering QR',
        position: { lat: 33.4205, lng: -111.9295 },
        floor: 0,
        buildingId: 'bld-eng',
        code: 'https://navi.app/checkin/eng',
        metadata: { scanner: 'v2' },
      },
    ],
  }
}

describe('S-001: Data round-trip integrity', () => {
  // ── Phase 1: Pure JSON serialization (no GraphAdapter) ──
  describe('JSON serialization round-trip', () => {
    it('survives roundTrip() equality check', () => {
      const doc = makeFullDocument()
      const result = roundTrip(doc)
      expect(result.success).toBe(true)
    })

    it('strips _changeJournal from serialized output', () => {
      const doc = makeFullDocument()
      doc._changeJournal = [
        { entityId: 'rm-101', entityType: 'room', operation: 'created' },
      ]
      doc.version = 43
      const json = serializeDocument(doc)
      const parsed = JSON.parse(json)
      expect(parsed._changeJournal).toBeUndefined()
      expect(parsed.version).toBe(43)
    })

    it('preserves all top-level fields', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      expect(restored.schemaVersion).toBe(1)
      expect(restored.version).toBe(42)
      expect(restored.metadata.name).toBe('ASU Polytechnic')
      expect(restored.metadata.editorVersion).toBe('1.0.0')
    })

    it('preserves building fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const b = restored.buildings[0]
      expect(b.id).toBe('bld-eng')
      expect(b.name).toBe('Engineering Building')
      expect(b.code).toBe('ENG')
      expect(b.category).toBe('academic')
      expect(b.description).toBe('Houses CS and EE departments')
      expect(b.department).toBe('Engineering')
      expect(b.footprint.points).toHaveLength(5)
      expect(b.baseElevation).toBe(0)
      expect(b.height).toBe(25)
      expect(b.color).toBe('#336699')
      expect(b.aliases).toEqual(['Eng', 'Engineering'])
      expect(b.metadata).toEqual({ built: 1998 })
    })

    it('preserves floor fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const f = restored.buildings[0].floors[0]
      expect(f.id).toBe('flr-g')
      expect(f.level).toBe(0)
      expect(f.label).toBe('Ground Floor')
      expect(f.elevation).toBe(0)
      expect(f.planImageId).toBe('plan-g-001')
      expect(f.textureId).toBe('tex-concrete')
      expect(f.svgOverlayId).toBe('svg-floor-g')
      expect(f.metadata).toEqual({ wing: 'east' })
    })

    it('preserves room fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const r = restored.buildings[0].floors[0].rooms[0]
      expect(r.id).toBe('rm-101')
      expect(r.name).toBe('Room 101')
      expect(r.number).toBe('101')
      expect(r.category).toBe('classroom')
      expect(r.polygon.points).toHaveLength(5)
      expect(r.polygon.points[0]).toEqual({ x: 0, y: 0 })
      expect(r.entrancePosition).toEqual({ x: 5, y: 0 })
      expect(r.capacity).toBe(40)
      expect(r.metadata).toEqual({ projector: true, seats: 40 })
    })

    it('preserves hallway fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const h = restored.buildings[0].floors[0].hallways[0]
      expect(h.id).toBe('hw-main')
      expect(h.name).toBe('Main Hallway')
      expect(h.polyline.points).toHaveLength(2)
      expect(h.width).toBe(3)
      expect(h.color).toBe('#e0e0e0')
    })

    it('preserves staircase fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const s = restored.buildings[0].floors[0].staircases[0]
      expect(s.id).toBe('st-north')
      expect(s.name).toBe('North Stairs')
      expect(s.position).toEqual({ x: 2, y: 2 })
      expect(s.fromLevel).toBe(0)
      expect(s.toLevel).toBe(2)
      expect(s.type).toBe('enclosed')
    })

    it('preserves elevator fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const e = restored.buildings[0].floors[0].elevators[0]
      expect(e.id).toBe('el-main')
      expect(e.name).toBe('Main Elevator')
      expect(e.position).toEqual({ x: 8, y: 2 })
      expect(e.fromLevel).toBe(-1)
      expect(e.toLevel).toBe(3)
    })

    it('preserves entrance fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const e = restored.buildings[0].floors[0].entrances[0]
      expect(e.id).toBe('ent-main')
      expect(e.label).toBe('Main Entrance')
      expect(e.position).toEqual({ lat: 33.4205, lng: -111.9295 })
      expect(e.level).toBe(0)
      expect(e.type).toBe('main')
      expect(e.hasQR).toBe(true)
      expect(e.hasPanorama).toBe(true)
      expect(e.connectorRoadId).toBe('road-main')
    })

    it('preserves road fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const r = restored.roads[0]
      expect(r.id).toBe('road-main')
      expect(r.name).toBe('Main Road')
      expect(r.polyline.points).toHaveLength(2)
      expect(r.width).toBe(5)
      expect(r.surface).toBe('paved')
      expect(r.type).toBe('arterial')
      expect(r.connectorEntranceId).toBe('ent-main')
      expect(r.metadata).toEqual({ lanes: 2 })
    })

    it('preserves panorama fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const p = restored.panoramas[0]
      expect(p.id).toBe('pano-front')
      expect(p.label).toBe('Front Gate View')
      expect(p.position).toEqual({ lat: 33.42, lng: -111.93 })
      expect(p.heading).toBe(180)
      expect(p.imageAssetId).toBe('asset-pano-front-001')
      expect(p.buildingId).toBe('bld-eng')
      expect(p.floor).toBe(0)
      expect(p.hotspots).toHaveLength(1)
      expect(p.hotspots[0].target).toEqual({ type: 'entrance', targetId: 'ent-main' })
    })

    it('preserves QR checkpoint fields through serialization', () => {
      const doc = makeFullDocument()
      const json = serializeDocument(doc)
      const restored = deserializeDocument(json)
      const q = restored.qrCheckpoints[0]
      expect(q.id).toBe('qr-entrance')
      expect(q.label).toBe('Engineering QR')
      expect(q.position).toEqual({ lat: 33.4205, lng: -111.9295 })
      expect(q.floor).toBe(0)
      expect(q.buildingId).toBe('bld-eng')
      expect(q.code).toBe('https://navi.app/checkin/eng')
      expect(q.metadata).toEqual({ scanner: 'v2' })
    })
  })

  // ── Phase 2: Full pipeline round-trip (CampusDocument → GraphAdapter → createDocument) ──
  describe('GraphAdapter pipeline round-trip', () => {
    it('sync + createDocument preserves building identity', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      // Register building so coordinate transforms work
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const b1 = doc.buildings[0]
      const b2 = doc2.buildings.find(b => b.id === 'bld-eng')!
      expect(b2).toBeDefined()
      expect(b2.name).toBe(b1.name)
      expect(b2.code).toBe(b1.code)
      expect(b2.category).toBe(b1.category)
      expect(b2.description).toBe(b1.description)
      expect(b2.department).toBe(b1.department)
      expect(b2.baseElevation).toBe(b1.baseElevation)
      expect(b2.height).toBe(b1.height)
      expect(b2.color).toBe(b1.color)
      expect(b2.aliases).toEqual(b1.aliases)
      expect(b2.footprint.points).toEqual(b1.footprint.points)
      expect(b2.metadata).toEqual(b1.metadata)
    })

    it('sync + createDocument preserves floor identity', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const f1 = doc.buildings[0].floors[0]
      const f2 = doc2.buildings[0].floors.find(f => f.id === 'flr-g')!
      expect(f2).toBeDefined()
      expect(f2.level).toBe(f1.level)
      expect(f2.label).toBe(f1.label)
      expect(f2.elevation).toBe(f1.elevation)
      expect(f2.planImageId).toBe(f1.planImageId)
      expect(f2.textureId).toBe(f1.textureId)
      expect(f2.svgOverlayId).toBe(f1.svgOverlayId)
      expect(f2.metadata).toEqual(f1.metadata)
    })

    it('sync + createDocument preserves room id and metadata', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const r1 = doc.buildings[0].floors[0].rooms[0]
      const r2 = doc2.buildings[0].floors[0].rooms.find(r => r.id === 'rm-101')!
      expect(r2).toBeDefined()
      expect(r2.name).toBe(r1.name)
      expect(r2.number).toBe(r1.number)
      expect(r2.category).toBe(r1.category)
      expect(r2.capacity).toBe(r1.capacity)
      expect(r2.metadata).toEqual(r1.metadata)
      // Room polygon is rebuilt from world→local coords — may have precision drift
      expect(r2.polygon.points).toHaveLength(r1.polygon.points.length)
    })

    it('sync + createDocument preserves hallway id and metadata', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const h1 = doc.buildings[0].floors[0].hallways[0]
      const h2 = doc2.buildings[0].floors[0].hallways.find(h => h.id === 'hw-main')!
      expect(h2).toBeDefined()
      expect(h2.name).toBe(h1.name)
      expect(h2.width).toBe(h1.width)
      expect(h2.color).toBe(h1.color)
      expect(h2.polyline.points).toHaveLength(h1.polyline.points.length)
    })

    it('sync + createDocument preserves staircase id and metadata', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const s1 = doc.buildings[0].floors[0].staircases[0]
      const s2 = doc2.buildings[0].floors[0].staircases.find(s => s.id === 'st-north')!
      expect(s2).toBeDefined()
      expect(s2.name).toBe(s1.name)
      expect(s2.fromLevel).toBe(s1.fromLevel)
      expect(s2.toLevel).toBe(s1.toLevel)
      expect(s2.type).toBe(s1.type)
    })

    it('sync + createDocument preserves elevator id and metadata', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const e1 = doc.buildings[0].floors[0].elevators[0]
      const e2 = doc2.buildings[0].floors[0].elevators.find(e => e.id === 'el-main')!
      expect(e2).toBeDefined()
      expect(e2.name).toBe(e1.name)
      expect(e2.fromLevel).toBe(e1.fromLevel)
      expect(e2.toLevel).toBe(e1.toLevel)
    })

    it('sync + createDocument preserves entrance identity', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const e1 = doc.buildings[0].floors[0].entrances[0]
      const e2 = doc2.buildings[0].floors[0].entrances.find(e => e.id === 'ent-main')!
      expect(e2).toBeDefined()
      expect(e2.label).toBe(e1.label)
      expect(e2.type).toBe(e1.type)
      expect(e2.hasQR).toBe(e1.hasQR)
      expect(e2.hasPanorama).toBe(e1.hasPanorama)
    })

    it('sync + createDocument preserves roads', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const r1 = doc.roads[0]
      const r2 = doc2.roads.find(r => r.id === 'road-main')!
      expect(r2).toBeDefined()
      expect(r2.name).toBe(r1.name)
      expect(r2.width).toBe(r1.width)
      expect(r2.polyline.points).toEqual(r1.polyline.points)
    })

    it('sync + createDocument preserves panorama identity', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const p1 = doc.panoramas[0]
      const p2 = doc2.panoramas.find(p => p.id === 'pano-front')!
      expect(p2).toBeDefined()
      expect(p2.label).toBe(p1.label)
      expect(p2.position).toEqual(p1.position)
      expect(p2.buildingId).toBe(p1.buildingId)
      expect(p2.floor).toBe(p1.floor)
    })

    it('sync + createDocument preserves QR checkpoint identity', () => {
      const doc = makeFullDocument()
      const graph = new Graph()
      const transformer = new CoordinateTransformer()
      transformer.registerBuilding({
        buildingId: 'bld-eng',
        origin: { lat: 33.4205, lng: -111.9295 },
        rotation: 0,
      })
      new GraphAdapter(graph, transformer).sync(doc)
      const doc2 = createDocument(graph, transformer)

      const q1 = doc.qrCheckpoints[0]
      const q2 = doc2.qrCheckpoints.find(q => q.id === 'qr-entrance')!
      expect(q2).toBeDefined()
      expect(q2.label).toBe(q1.label)
      expect(q2.position).toEqual(q1.position)
      expect(q2.floor).toBe(q1.floor)
      expect(q2.buildingId).toBe(q1.buildingId)
      expect(q2.code).toBe(q1.code)
    })
  })
})
