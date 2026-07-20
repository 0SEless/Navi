import { describe, it, expect } from 'vitest'
import type { CampusDocument, Building, Floor, Entrance, Road, Panorama, QRCheckpoint } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import { Graph } from '@/engine/graph'
import { GraphAdapter } from './graph-adapter'

function createTestDocument(extraBuilding?: Building): CampusDocument {
  const buildings: Building[] = [
    {
      id: 'bld-1',
      name: 'Test Building',
      code: 'TB',
      category: 'academic',
      description: '',
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
      height: 20,
      floors: [
        {
          id: 'flr-0',
          level: 0,
          label: 'Ground',
          elevation: 0,
          rooms: [],
          hallways: [],
          staircases: [],
          elevators: [],
          entrances: [
            {
              id: 'ent-1',
              label: 'Main Entrance',
              position: { lat: 33.4205, lng: -111.9295 },
              level: 0,
              type: 'main',
              hasQR: true,
              hasPanorama: true,
            },
          ],
          connectorStops: [
            { id: 'cs-stairA', connectorId: 'conn-stairA', position: { x: 1, y: 1 }, anchors: [], accessible: true, metadata: {} },
          ],
          metadata: {},
        },
      ],
      aliases: [],
      verticalConnectors: [
        { id: 'conn-stairA', type: 'staircase', name: 'Stair A', stopIds: ['cs-stairA'], accessible: true, metadata: {} },
      ],
      color: '#ff0000',
      metadata: {},
    },
  ]

  if (extraBuilding) {
    buildings.push(extraBuilding)
  }

  const roads: Road[] = [
    {
      id: 'road-1',
      name: 'Main Road',
      polyline: {
        points: [
          { lat: 33.42, lng: -111.93 },
          { lat: 33.421, lng: -111.929 },
          { lat: 33.422, lng: -111.928 },
        ],
      },
      width: 5,
      surface: 'paved',
      type: 'arterial',
      metadata: {},
    },
  ]

  const panoramas: Panorama[] = [
    {
      id: 'pano-1',
      label: 'Front Gate',
      position: { lat: 33.42, lng: -111.93 },
      heading: 180,
      imageAssetId: 'asset-pano-1',
      hotspots: [],
    },
  ]

  const qrCheckpoints: QRCheckpoint[] = [
    {
      id: 'qr-1',
      label: 'Building Entrance QR',
      position: { lat: 33.4205, lng: -111.9295 },
      floor: 0,
      buildingId: 'bld-1',
      code: 'https://navi.app/checkin/bld-1',
      metadata: {},
    },
  ]

  return {
    schemaVersion: 1,
    metadata: {
      name: 'Test Campus',
      description: '',
      lastModified: '2026-07-08T00:00:00Z',
      editorVersion: '1.0.0',
    },
    buildings,
    roads,
    panoramas,
    qrCheckpoints,
  }
}

describe('GraphAdapter', () => {
  it('sync() populates graph from document', () => {
    const graph = new Graph()
    const adapter = new GraphAdapter(graph)
    const doc = createTestDocument()

    adapter.sync(doc)

    expect(graph.buildingCount).toBe(1)
    expect(graph.nodeCount).toBeGreaterThan(0)
    expect(graph.edgeCount).toBeGreaterThan(0)
    expect(graph.componentCount).toBe(1)
    expect(graph.traces.length).toBe(1)

    const building = graph.buildings[0]
    expect(building.name).toBe('Test Building')
    expect(building.floors).toEqual([0])

    const panoNodes = graph.nodes.filter(n => n.label.startsWith('Panorama:'))
    expect(panoNodes.length).toBe(1)
    expect(panoNodes[0].label).toBe('Panorama: Front Gate')

    const qrNodes = graph.nodes.filter(n => n.type === 'qr_marker')
    expect(qrNodes.length).toBe(1)
    expect(qrNodes[0].label).toBe('QR: Building Entrance QR')
  })

  it('sync() creates connector stop nodes and vertical connector edges with transformer', () => {
    const tf = new CoordinateTransformer()
    tf.registerBuilding({ buildingId: 'bld-1', origin: { lat: 33.4205, lng: -111.9295 }, rotation: 0 })

    const graph = new Graph()
    const adapter = new GraphAdapter(graph, tf)
    const doc = createTestDocument()

    // Add a second floor with matching connector stop
    const building = doc.buildings[0]
    building.floors.push({
      id: 'flr-1',
      level: 1,
      label: 'Second Floor',
      elevation: 4,
      rooms: [],
      hallways: [],
      staircases: [],
      elevators: [],
      entrances: [],
      connectorStops: [
        { id: 'cs-stairA-f1', connectorId: 'conn-stairA', position: { x: 1, y: 1 }, anchors: [], accessible: true, metadata: {} },
      ],
      metadata: {},
    })

    adapter.sync(doc)

    const stopNodes = graph.nodes.filter(n => n.type === 'connector_stop')
    expect(stopNodes.length).toBe(2)

    // Should have a vertical connector edge connecting the two stops
    const connEdges = graph.edges.filter(e => e.id.startsWith('E-vconn-conn-stairA'))
    expect(connEdges.length).toBe(1)
    expect(connEdges[0].type).toBe('stair')
  })

  it('sync() handles empty document gracefully', () => {
    const graph = new Graph()
    const adapter = new GraphAdapter(graph)
    const emptyDoc: CampusDocument = {
      schemaVersion: 1,
      metadata: { name: '', description: '', lastModified: '', editorVersion: '' },
      buildings: [],
      roads: [],
      panoramas: [],
      qrCheckpoints: [],
    }

    adapter.sync(emptyDoc)

    expect(graph.buildingCount).toBe(0)
    expect(graph.nodeCount).toBe(0)
    expect(graph.edgeCount).toBe(0)
    expect(graph.componentCount).toBe(0)
    expect(graph.traces.length).toBe(0)
  })

  it('syncEntity() re-syncs entire document', () => {
    const graph = new Graph()
    const adapter = new GraphAdapter(graph)
    const doc = createTestDocument()

    adapter.sync(doc)
    expect(graph.buildingCount).toBe(1)

    const extraBuilding: Building = {
      id: 'bld-2',
      name: 'Second Building',
      code: 'SB',
      category: 'library',
      description: '',
      footprint: {
        points: [
          { lat: 33.43, lng: -111.92 },
          { lat: 33.431, lng: -111.92 },
          { lat: 33.431, lng: -111.919 },
          { lat: 33.43, lng: -111.919 },
          { lat: 33.43, lng: -111.92 },
        ],
      },
      baseElevation: 0,
      height: 15,
      floors: [],
      verticalConnectors: [],
      aliases: [],
      color: '#00ff00',
      metadata: {},
    }

    const extendedDoc = createTestDocument(extraBuilding)
    adapter.syncEntity('bld-2', extendedDoc)

    expect(graph.buildingCount).toBe(2)
    const names = graph.buildings.map(b => b.name).sort()
    expect(names).toEqual(['Second Building', 'Test Building'])
  })
})
