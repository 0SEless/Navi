import type { CampusDocument } from '@navi/core'

/**
 * Rich CampusDocument fixture for Dataset Management tests.
 *
 * Deliberately mirrors real authored data so tests assert against genuine
 * shapes: two buildings (one with two floors + rooms + indoor POI, one with
 * no floors), outdoor POI + area, one outdoor panorama + one indoor panorama
 * on floor level 1. All fields are required-contract values — no casts.
 */

export function makeCampusDocument(overrides: Partial<CampusDocument> = {}): CampusDocument {
  return {
    schemaVersion: 1,
    version: 3,
    metadata: {
      campusId: 'map-ds-1',
      name: 'ASU Ibajay',
      description: 'Main campus of ASU Ibajay',
      lastModified: '2026-09-01T08:30:00.000Z',
      editorVersion: '1.4.0',
    },
    buildings: [
      {
        id: 'bld-cs',
        name: 'Computer Science Building',
        code: 'CS',
        category: 'academic',
        description: 'Houses computing departments',
        department: 'College of Computing',
        footprint: {
          points: [
            { lat: 10.5, lng: 120.5 },
            { lat: 10.51, lng: 120.5 },
            { lat: 10.51, lng: 120.51 },
            { lat: 10.5, lng: 120.51 },
          ],
        },
        baseElevation: 12,
        height: 15,
        floors: [
          {
            id: 'flr-cs-0',
            level: 0,
            label: 'Ground Floor',
            shortLabel: 'GF',
            elevation: 0,
            height: 3.5,
            rooms: [
              {
                id: 'rm-101',
                name: 'Room 101',
                number: '101',
                category: 'classroom',
                polygon: {
                  points: [
                    { x: 0, y: 0 },
                    { x: 4, y: 0 },
                    { x: 4, y: 3 },
                    { x: 0, y: 3 },
                  ],
                },
                roomDoors: [],
                metadata: {},
              },
            ],
            hallways: [],
            staircases: [],
            elevators: [],
            entrances: [],
            connectorStops: [],
            parametricComponents: [],
            pois: [
              {
                id: 'poi-in-1',
                name: 'Help Desk',
                category: 'information',
                geometry: { type: 'point', position: { x: 1, y: 1 } },
              },
            ],
            metadata: {},
          },
          {
            id: 'flr-cs-1',
            level: 1,
            label: 'Second Floor',
            shortLabel: '2F',
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
        color: '#3b82f6',
        aliases: ['CS Block'],
        metadata: {},
      },
      {
        id: 'bld-empty',
        name: 'Storage Annex',
        code: 'SA',
        category: 'facility',
        description: '',
        footprint: {
          points: [
            { lat: 10.52, lng: 120.52 },
            { lat: 10.521, lng: 120.52 },
            { lat: 10.521, lng: 120.521 },
            { lat: 10.52, lng: 120.521 },
          ],
        },
        baseElevation: 11,
        height: 5,
        floors: [],
        verticalConnectors: [],
        color: '#94a3b8',
        aliases: [],
        metadata: {},
      },
    ],
    roads: [],
    panoramas: [
      {
        id: 'pan-out-1',
        label: 'Main Gate View',
        position: { lat: 10.5, lng: 120.5 },
        heading: 90,
        imageAssetId: 'asset-out-1',
        hotspots: [],
      },
      {
        id: 'pan-in-1',
        label: 'CS Lobby',
        position: { x: 0, y: 0 },
        heading: 0,
        imageAssetId: 'asset-in-1',
        buildingId: 'bld-cs',
        floor: 1,
        hotspots: [],
      },
    ],
    qrCheckpoints: [],
    pois: [
      {
        id: 'poi-out-1',
        scope: 'outdoor',
        name: 'Main Gate',
        category: 'information',
        geometry: { type: 'point', position: { lat: 10.5, lng: 120.5 } },
      },
    ],
    areas: [
      {
        id: 'area-1',
        name: 'Quadrangle',
        points: [
          { lat: 10.5, lng: 120.5 },
          { lat: 10.501, lng: 120.5 },
          { lat: 10.501, lng: 120.501 },
        ],
        color: '#22c55e',
      },
    ],
    ...overrides,
  }
}
