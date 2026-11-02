/**
 * Save v2 campus fixtures.
 *
 * Every fixture builder returns a FRESH object graph on each call (no shared
 * mutable state) and is fully deterministic (no clocks, no unseeded random).
 *
 * `fixtureFull` populates every optional CampusDocument / Building / Floor field
 * that NAVI 1.5 allows in saved data. Ruling R2: NAVI 1.5 forbids three things in
 * saved data, so fixtureFull does NOT carry them (see DISALLOWED_IN_1_5);
 * `fixtureWith15Violations` adds them back for negative tests.
 *
 * Geometry sits near ASU Ibajay, Aklan (11.68 N, 122.37 E). World positions are
 * produced from metre offsets with `ll()` so the numbers stay readable. Indoor
 * coordinates are building-local metres relative to the building footprint
 * centroid.
 */
import type {
  Area,
  Building,
  CampusDocument,
  Floor,
  OutdoorPointOfInterest,
  QRCheckpoint,
  Road,
  RoadJunction,
  SeparatedCrossing,
  TerrainArea,
  TerrainVerticalDatum,
} from '@navi/core'
import { createBuilding, createDocument, createFloor, createRoom } from '@navi/editor/test-helpers'

/**
 * Fields NAVI 1.5 forbids in saved data (ruling R2). fixtureFull omits them
 * (panoramas is present only as `[]`).
 */
export const DISALLOWED_IN_1_5 = [
  'Floor.textureId',
  'Floor.svgOverlayId',
  'CampusDocument.panoramas (non-empty)',
] as const

// ── Coordinate helpers ───────────────────────────────────────────────────────

const ORIGIN = { lat: 11.68, lng: 122.37 }
const METERS_PER_DEG_LAT = 111_320
const METERS_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)

/** World LatLng from metres east / north of the campus origin (7 decimals ~ 1 cm). */
function ll(eastM: number, northM: number, origin = ORIGIN): { lat: number; lng: number } {
  const lat = origin.lat + northM / METERS_PER_DEG_LAT
  const lng = origin.lng + eastM / METERS_PER_DEG_LNG
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 }
}

/** Closed rectangular world ring (first === last) from SW corner and size in metres. */
function worldRect(eastM: number, northM: number, widthM: number, heightM: number) {
  const sw = ll(eastM, northM)
  const se = ll(eastM + widthM, northM)
  const ne = ll(eastM + widthM, northM + heightM)
  const nw = ll(eastM, northM + heightM)
  return { points: [sw, se, ne, nw, { ...sw }] }
}

/** Closed local ring from min/max corners. */
function localRect(x0: number, y0: number, x1: number, y1: number) {
  return {
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
      { x: x0, y: y0 },
    ],
  }
}

const FIXED_METADATA = {
  campusId: 'asu-ibajay',
  name: 'ASU Ibajay',
  description: 'Aklan State University, Ibajay campus (test fixture)',
  lastModified: '2026-10-31T00:00:00.000Z',
  editorVersion: '1.5.0',
}

// ── fixtureMinimal ───────────────────────────────────────────────────────────

/** One building, one floor, no optional fields. */
export function fixtureMinimal(): CampusDocument {
  return createDocument({
    version: 1,
    metadata: { ...FIXED_METADATA, campusId: 'minimal-campus', name: 'Minimal Campus', description: '' },
    buildings: [
      createBuilding({
        id: 'bld-min',
        name: 'Minimal Hall',
        code: 'MIN',
        footprint: worldRect(0, 0, 30, 20),
        floors: [
          createFloor({
            id: 'flr-min-0',
            level: 0,
            label: 'Ground Floor',
            parametricComponents: [],
          } as Partial<Floor>),
        ],
      }),
    ],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  })
}

// ── fixtureFull ──────────────────────────────────────────────────────────────

const LIB_ID = 'osm:way/123'
const LIB_GROUND = 'bib/ground'
const LIB_UPPER = 'bib/upper'

function libraryGroundFloor(): Floor {
  return createFloor({
    id: LIB_GROUND,
    level: 0,
    label: 'Ground Floor',
    shortLabel: 'GF',
    elevation: 0,
    height: 3.5,
    offset: { x: 0.5, y: -0.25 },
    rotation: 2.5,
    planImageId: 'asset:plan-ground',
    floorPlanState: 'locked',
    planAlignment: {
      offset: { x: 1.25, y: -2 },
      scale: 1.1,
      scaleX: 1.05,
      scaleY: 0.95,
      rotation: 3,
      opacity: 0.6,
      locked: true,
    },
    visible: true,
    locked: false,
    walls: [
      { id: 'wall-s', start: { x: -18, y: -10 }, end: { x: 18, y: -10 }, thickness: 0.3, height: 3.5 },
      { id: 'wall-e', start: { x: 18, y: -10 }, end: { x: 18, y: 10 }, thickness: 0.3, height: 3.5, metadata: { material: 'concrete', note: 'load-bearing' } },
      { id: 'wall-n', start: { x: 18, y: 10 }, end: { x: -18, y: 10 }, thickness: 0.3, height: 3.5 },
      { id: 'wall-w', start: { x: -18, y: 10 }, end: { x: -18, y: -10 }, thickness: 0.3, height: 3.5 },
      { id: 'wall-mid', start: { x: -4, y: -10 }, end: { x: -4, y: 2 }, thickness: 0.15, height: 3.5, metadata: {} },
    ],
    roomAttributes: [
      {
        faceId: 'face-1',
        roomId: 'room-g-1',
        name: 'Reading Room',
        type: 'classroom',
        code: 'BIB-101',
        description: 'Quiet reading room',
        number: '101',
        category: 'classroom',
        searchable: true,
        accessPoints: [
          { openingId: 'op-door-1', routeNodeId: 'rn-g-2', primary: true },
          { routeNodeId: 'rn-g-3', primary: false },
        ],
      },
      { faceId: 'face-2', name: 'Stacks', searchable: false },
    ],
    rooms: [
      createRoom({
        id: 'room-g-1',
        name: 'Reading Room',
        number: '101',
        category: 'classroom',
        polygon: localRect(-18, -10, -4, 2),
        entrancePosition: { x: -11, y: 2 },
        roomDoors: [
          {
            id: 'rd-1',
            roomId: 'room-g-1',
            ownership: { status: 'assigned' },
            connectedToId: 'hall-g-1',
            connectedToType: 'hallway',
            doorType: 'standard',
            position: { x: -11, y: 2 },
            width: 1.2,
            depth: 0.2,
            rotation: 1.5707963,
            name: 'Reading Room door',
            angle: 90,
            routeConnection: { anchorNodeId: 'rn-g-2', targetRouteNodeId: 'rn-g-3', connectorEdgeId: 're-g-2' },
            metadata: { handedness: 'left' },
          },
        ],
        capacity: 40,
        metadata: { floorArea: 168, tags: ['quiet', 'ñoño'], contact: null },
      }),
      createRoom({
        id: 'room-g-2',
        name: 'Archive',
        number: '102',
        category: 'storage',
        polygon: localRect(-4, -10, 18, 2),
        roomDoors: [],
        metadata: {},
      }),
    ],
    hallways: [
      {
        id: 'hall-g-1',
        name: 'Main Hallway',
        polyline: { points: [{ x: -18, y: 4 }, { x: 18, y: 4 }] },
        width: 3,
        color: '#dddddd',
      },
    ],
    staircases: [
      { id: 'lst-1', name: 'Legacy stair', position: { x: 10, y: -6 }, fromLevel: 0, toLevel: 1, type: 'enclosed' },
    ],
    elevators: [
      { id: 'lel-1', name: 'Legacy lift', position: { x: 14, y: -6 }, fromLevel: 0, toLevel: 1 },
    ],
    entrances: [
      {
        id: 'ent-main',
        label: 'Main Entrance',
        position: { x: 18, y: 4 },
        level: 0,
        type: 'main',
        hasQR: true,
        hasPanorama: false,
        connectorRoadId: 'road-main',
      },
    ],
    connectorStops: [
      {
        id: 'stop-g-stair',
        connectorId: 'conn-stair',
        label: 'Stair landing',
        position: { x: 8, y: 4 },
        rotation: 90,
        landingPolygon: localRect(6, 3, 10, 5),
        connectedHallwayId: 'hall-g-1',
        anchors: [{ id: 'anc-qr-1', label: 'Stair QR', position: { x: 8, y: 4.5 }, code: 'NAVI-ANC-0001', metadata: { printed: true } }],
        accessible: true,
        metadata: {},
      },
      {
        id: 'stop-g-lift',
        connectorId: 'conn-lift',
        position: { x: 14, y: 4 },
        anchors: [],
        accessible: true,
        metadata: {},
      },
    ],
    parametricComponents: [
      { id: 'pc-1', definitionId: 'column', position: { x: 0, y: 0 }, rotation: 0, properties: { radius: 0.3, finish: 'matte' } },
    ],
    pois: [
      {
        id: 'poi-g-1',
        name: 'Water fountain',
        category: 'water_fountain',
        position: { x: -16, y: 5.5 },
        metadata: { working: true },
      },
      {
        id: 'poi-g-2',
        name: 'Study corner',
        category: 'study_area',
        geometry: { type: 'rectangle', min: { x: 2, y: 5.5 }, max: { x: 6, y: 8 }, rotation: 0.25 },
        appearance: { mode: '2.5d', height: 1.2, color: '#3366cc' },
        visibility: { showOnMap: true, searchable: false },
        navigation: { approachMode: 'preferred', anchor: { kind: 'rectangle-edge', edge: 2, t: 0.5 } },
      },
    ],
    doors: [
      {
        id: 'door-1',
        roomId: 'room-g-2',
        ownership: { status: 'assigned' },
        connectedToId: 'hall-g-1',
        connectedToType: 'hallway',
        doorType: 'sliding',
        position: { x: 7, y: 2 },
        width: 1.6,
        depth: 0.15,
        rotation: 0,
        geometry: { type: 'rectangle', min: { x: 6.2, y: 1.9 }, max: { x: 7.8, y: 2.1 }, rotation: 0 },
        name: 'Archive door',
        angle: 0,
        routeConnection: { anchorNodeId: 'rn-g-2', targetRouteNodeId: 'rn-g-3', connectorEdgeId: 're-g-2' },
        metadata: {},
      },
      {
        id: 'door-2',
        ownership: { status: 'ambiguous', candidateRoomIds: ['room-g-1', 'room-g-2'] },
        doorType: 'fire',
        position: { x: -4, y: -4 },
        width: 1,
        metadata: { reviewNeeded: true },
      },
    ],
    windows: [
      { id: 'win-1', wallId: 'room:room-g-1:3', offset: 3, width: 2, sillHeight: 0.9, metadata: {} },
    ],
    openings: [
      { id: 'op-door-1', type: 'door', wallId: 'wall-mid', offset: 4, width: 1.2, height: 2.1, sillHeight: 0, orientation: 90, metadata: { leaf: 'single' } },
      { id: 'op-win-1', type: 'window', wallId: 'wall-n', offset: 10, width: 2, height: 1.2, sillHeight: 0.9 },
    ],
    routeNetwork: {
      nodes: [
        { id: 'rn-g-1', type: 'entrance', position: { x: 16, y: 4 }, floor: 0 },
        { id: 'rn-g-4', type: 'transition', position: { x: 14, y: 4 }, floor: 0 },
        { id: 'rn-g-3', type: 'transition', position: { x: 8, y: 4 }, floor: 0 },
        { id: 'rn-g-2', type: 'waypoint', position: { x: 0, y: 4 }, floor: 0 },
        { id: 'rn-g-5', type: 'poi', position: { x: -16, y: 4 }, floor: 0 },
      ],
      edges: [
        { id: 're-g-1', from: 'rn-g-1', to: 'rn-g-4', type: 'walk', distance: 2 },
        { id: 're-g-3', from: 'rn-g-4', to: 'rn-g-3', type: 'walk', distance: 6 },
        { id: 're-g-2', from: 'rn-g-3', to: 'rn-g-2', type: 'walk', distance: 8 },
        { id: 're-g-4', from: 'rn-g-2', to: 'rn-g-5', type: 'walk', distance: 16 },
      ],
    },
    entranceAccess: [
      {
        entranceId: 'ent-main',
        outdoorNodeId: 'N-entrance-access-ent-main',
        indoorRouteNodeId: 'rn-g-1',
        outdoorRouteId: 'road-main',
        outdoorPosition: ll(46, 16),
      },
    ],
    metadata: { zoneNote: 'Biblioteca ground', floorStats: { rooms: 2, area: 720.5 }, ids: ['a:b', 'c/d'] },
  } as Partial<Floor>)
}

function libraryUpperFloor(): Floor {
  return createFloor({
    id: LIB_UPPER,
    level: 1,
    label: 'Upper Floor',
    shortLabel: '1F',
    elevation: 4,
    height: 3.2,
    planImageId: 'asset:plan-upper',
    floorPlanState: 'active',
    planAlignment: {},
    visible: false,
    locked: true,
    rooms: [
      createRoom({
        id: 'room-u-1',
        name: 'Study Hall',
        number: '201',
        category: 'classroom',
        polygon: localRect(-18, -10, 0, 2),
        roomDoors: [],
        metadata: {},
      }),
    ],
    hallways: [
      { id: 'hall-u-1', name: 'Upper Hallway', polyline: { points: [{ x: -18, y: 4 }, { x: 18, y: 4 }] }, width: 3 },
    ],
    staircases: [],
    elevators: [],
    entrances: [],
    connectorStops: [
      { id: 'stop-u-stair', connectorId: 'conn-stair', label: 'Stair landing', position: { x: 8, y: 4 }, anchors: [], accessible: true, metadata: {} },
      { id: 'stop-u-lift', connectorId: 'conn-lift', position: { x: 14, y: 4 }, anchors: [], accessible: true, metadata: {} },
    ],
    parametricComponents: [],
    routeNetwork: {
      nodes: [
        { id: 'rn-u-3', type: 'transition', position: { x: 14, y: 4 }, floor: 1 },
        { id: 'rn-u-1', type: 'transition', position: { x: 8, y: 4 }, floor: 1 },
        { id: 'rn-u-2', type: 'waypoint', position: { x: -8, y: 4 }, floor: 1 },
      ],
      edges: [
        { id: 're-u-1', from: 'rn-u-3', to: 'rn-u-1', type: 'walk', distance: 6 },
        { id: 're-u-2', from: 'rn-u-1', to: 'rn-u-2', type: 'walk', distance: 16 },
      ],
    },
    metadata: {},
  } as Partial<Floor>)
}

function libraryBuilding(): Building {
  return createBuilding({
    id: LIB_ID,
    name: 'Biblioteca Ñoño \u{1F600}',
    code: 'BIB',
    category: 'library',
    description: 'Main library with a long description — including “smart quotes”.',
    department: 'Library Services',
    footprint: worldRect(0, 0, 40, 24),
    baseElevation: 5,
    height: 9,
    rotation: 12,
    roofHeight: 2.5,
    floors: [libraryGroundFloor(), libraryUpperFloor()],
    verticalConnectors: [
      { id: 'conn-stair', type: 'staircase', name: 'Stairwell A', stopIds: ['stop-g-stair', 'stop-u-stair'], accessible: true, metadata: {} },
      { id: 'conn-lift', type: 'elevator', name: 'Lift A', stopIds: ['stop-g-lift', 'stop-u-lift'], accessible: true, metadata: { capacityKg: 630 } },
    ],
    staircases: [
      {
        id: 'stair-1',
        buildingId: LIB_ID,
        name: 'Stair 1',
        type: 'enclosed',
        accessible: false,
        fromLevel: 0,
        toLevel: 1,
        levels: {
          0: {
            position: { x: 8, y: -6 },
            rotation: 0,
            polygon: localRect(6, -8, 10, -4),
            landing: { position: { x: 8, y: 4 }, rotation: 90, polygon: localRect(6, 3, 10, 5) },
            drawing: { definitionId: 'stair', properties: { stepCount: 18, stepWidth: 1.2, stepDepth: 0.28, direction: 'north', preset: 'straight' } },
          },
          1: { position: { x: 8, y: -6 }, rotation: 0 },
        },
      },
    ],
    elevators: [
      {
        id: 'elev-1',
        buildingId: LIB_ID,
        name: 'Elevator 1',
        type: 'passenger',
        accessible: true,
        fromLevel: 0,
        toLevel: 1,
        levels: {
          0: {
            position: { x: 14, y: -6 },
            rotation: 0,
            polygon: localRect(13, -7, 15, -5),
            landing: { position: { x: 14, y: 4 }, polygon: localRect(13, 3, 15, 5) },
            drawing: { definitionId: 'elevator', properties: { width: 2, depth: 2, doorSide: 'north' } },
          },
          1: { position: { x: 14, y: -6 }, rotation: 0 },
        },
      },
    ],
    verticalTransitions: [
      {
        id: 'vt-stair',
        featureId: 'stair-1',
        type: 'staircase',
        connections: [
          { floorId: LIB_GROUND, routeNodeId: 'rn-g-3' },
          { floorId: LIB_UPPER, routeNodeId: 'rn-u-1' },
        ],
      },
      {
        id: 'vt-lift',
        featureId: 'elev-1',
        type: 'elevator',
        connections: [
          { floorId: LIB_GROUND, routeNodeId: 'rn-g-4' },
          { floorId: LIB_UPPER, routeNodeId: 'rn-u-3' },
        ],
      },
    ],
    color: '#8844aa',
    aliases: ['Library', 'Biblioteca'],
    metadata: { yearBuilt: 1998, accessibleEntrance: true, nested: { b: 2, a: 1 } },
  })
}

function scienceBuilding(): Building {
  return createBuilding({
    id: 'bld-sci',
    name: 'Science Hall',
    code: 'SCI',
    category: 'academic',
    description: '',
    footprint: worldRect(80, 0, 30, 20),
    baseElevation: 5,
    height: 4,
    floors: [
      createFloor({
        id: 'sci-f1',
        level: 0,
        label: 'Ground Floor',
        elevation: 0,
        height: 3.5,
        rooms: [
          createRoom({
            id: 'room-s-1',
            name: 'Chemistry Lab',
            number: 'S101',
            category: 'lab',
            polygon: localRect(-12, -8, 0, 4),
            roomDoors: [
              {
                id: 'rd-s-1',
                roomId: 'room-s-1',
                connectedToId: 'hall-s-1',
                connectedToType: 'hallway',
                doorType: 'standard',
                position: { x: -6, y: 4 },
                width: 1.2,
                metadata: {},
              },
            ],
            metadata: {},
          }),
        ],
        hallways: [{ id: 'hall-s-1', name: 'Science Hallway', polyline: { points: [{ x: -14, y: 6 }, { x: 14, y: 6 }] }, width: 3 }],
        staircases: [],
        elevators: [],
        entrances: [{ id: 'ent-sci', label: 'Science Entrance', position: { x: -14, y: 6 }, level: 0, type: 'side', hasQR: false, hasPanorama: false, connectorRoadId: 'road-sci' }],
        connectorStops: [],
        parametricComponents: [],
        metadata: {},
      } as Partial<Floor>),
    ],
    verticalConnectors: [],
    color: '#22aa66',
    aliases: [],
    metadata: {},
  })
}

function campusRoads(): Road[] {
  return [
    {
      id: 'road-main',
      name: 'Main Avenue',
      polyline: { points: [ll(46, -30), ll(46, 16), ll(46, 50)] },
      width: 8,
      surface: 'paved',
      type: 'arterial',
      displayMode: 'visible',
      connectorEntranceId: 'ent-main',
      routing: { feature: 'normal', slope: 'level', direction: 'both', walkable: true, wheelchairAccessible: true },
      metadata: { lanes: 2 },
    },
    {
      id: 'road-ramp',
      name: 'Access Ramp',
      polyline: { points: [ll(46, -30), ll(62, -36)] },
      width: 3,
      surface: 'concrete',
      type: 'pedestrian',
      routing: { feature: 'ramp', slope: 'gentle', direction: 'both', startElevationMeters: 0, endElevationMeters: 1.5, walkable: true, wheelchairAccessible: true },
      metadata: {},
    },
    {
      id: 'road-stairs',
      name: 'Garden Steps',
      polyline: { points: [ll(62, -36), ll(62, -24)] },
      width: 2,
      surface: 'brick',
      type: 'pedestrian',
      displayMode: 'navigation-only',
      routing: { feature: 'stairs', slope: 'steep', direction: 'forward', startElevationMeters: 1.5, endElevationMeters: 4, walkable: true, wheelchairAccessible: false },
      metadata: {},
    },
    {
      id: 'road-bridge',
      name: 'Footbridge',
      polyline: { points: [ll(30, -24), ll(62, -24)] },
      width: 2.5,
      surface: 'concrete',
      type: 'pedestrian',
      routing: { feature: 'bridge', slope: 'level', direction: 'reverse', startElevationMeters: 4, endElevationMeters: 4, walkable: true },
      metadata: { clearanceMeters: 4.2 },
    },
    {
      id: 'road-sci',
      name: 'Science Walk',
      polyline: { points: [ll(46, 16), ll(76, 16), ll(76, 30)] },
      width: 4,
      surface: 'gravel',
      type: 'service',
      metadata: {},
    },
  ]
}

function campusJunctions(): RoadJunction[] {
  return [
    { id: 'rj-1', position: ll(46, -30), roadIds: ['road-main', 'road-ramp'], source: 'authored' },
    { id: 'rj-2', position: ll(62, -36), roadIds: ['road-ramp', 'road-stairs'], source: 'authored' },
    { id: 'rj-3', position: ll(62, -24), roadIds: ['road-stairs', 'road-bridge'], source: 'legacy-inferred' },
    { id: 'rj-4', position: ll(46, 16), roadIds: ['road-main', 'road-sci'], source: 'authored' },
  ]
}

function campusCrossings(): SeparatedCrossing[] {
  return [{ id: 'sc-1', roadIds: ['road-main', 'road-bridge'], position: ll(46, -24) }]
}

function campusAreas(): Area[] {
  return [{ id: 'area-1', name: 'Parking Lot A', points: [ll(70, 30), ll(95, 30), ll(95, 50), ll(70, 50)], color: '#999999' }]
}

function campusTerrainAreas(): TerrainArea[] {
  return [
    { id: 'terrain-1', name: 'Garden Mound', points: [ll(52, -40), ll(75, -40), ll(75, -28), ll(52, -28)], color: '#66aa55', elevationMeters: 1.5 },
    { id: 'terrain-2', name: 'Lowland', points: [ll(-30, -30), ll(-10, -30), ll(-10, -10), ll(-30, -10)], color: '#aabb88', elevationMeters: -0.5 },
  ]
}

function campusVerticalDatum(): TerrainVerticalDatum {
  return {
    kind: 'campus-local',
    name: 'Campus datum',
    zeroReference: 'Ground floor slab of the Library',
    elevationStatus: 'authored-not-surveyed',
  }
}

function campusOutdoorPois(): OutdoorPointOfInterest[] {
  return [
    { scope: 'outdoor', id: 'opoi-1', name: 'Flagpole', category: 'information', geometry: { type: 'point', position: ll(55, 10) }, metadata: { height: 12 } },
    {
      scope: 'outdoor',
      id: 'opoi-2',
      name: 'Fountain plaza',
      category: 'waiting_area',
      geometry: { type: 'circle', center: ll(60, 20), radius: 4 },
      appearance: { mode: '2d', color: '#33aadd' },
      visibility: { showOnMap: true, searchable: true },
      navigation: { approachMode: 'preferred', anchor: { kind: 'circle-angle', angle: 1.2 } },
    },
    {
      scope: 'outdoor',
      id: 'opoi-3',
      name: 'Canteen',
      category: 'food',
      geometry: { type: 'rectangle', points: [ll(65, 0), ll(75, 0), ll(75, 8), ll(65, 8)] },
      appearance: { mode: '2.5d', height: 3, color: '#ee8844' },
      visibility: { showOnMap: false, searchable: true },
    },
    {
      scope: 'outdoor',
      id: 'opoi-4',
      name: 'Bike shed',
      category: 'other',
      geometry: { type: 'polygon', points: [ll(55, 30), ll(62, 30), ll(62, 36), ll(58, 38), ll(55, 36)] },
      navigation: { approachMode: 'preferred', anchor: { kind: 'polygon-edge', edge: 1, t: 0.25 } },
    },
  ]
}

function campusQrCheckpoints(): QRCheckpoint[] {
  return [
    { id: 'qr-1', label: 'Library lobby', position: { x: 16, y: 4 }, floor: 0, buildingId: LIB_ID, code: 'NAVI-QR-0001', metadata: { printed: '2026-10-01' } },
    { id: 'qr-2', label: 'Science entrance', position: { x: -14, y: 6 }, floor: 0, buildingId: 'bld-sci', code: 'NAVI-QR-0002', metadata: {} },
  ]
}

/** Every optional CampusDocument / Building / Floor field populated (except the R2-forbidden ones). */
export function fixtureFull(): CampusDocument {
  return createDocument({
    schemaVersion: 1,
    version: 42,
    metadata: { ...FIXED_METADATA },
    buildings: [libraryBuilding(), scienceBuilding()],
    roads: campusRoads(),
    panoramas: [],
    qrCheckpoints: campusQrCheckpoints(),
    areas: campusAreas(),
    terrainAreas: campusTerrainAreas(),
    terrainVerticalDatum: campusVerticalDatum(),
    pois: campusOutdoorPois(),
    roadJunctions: campusJunctions(),
    separatedCrossings: campusCrossings(),
    connectivitySemanticsVersion: '1.0.0',
    boundary: { points: [ll(-40, -50), ll(120, -50), ll(120, 70), ll(-40, 70)] },
  })
}

// ── fixtureTerrain ──────────────────────────────────────────────────────────

/** A tile whose cells are all `cm` (base64 Int16LE, 128 × 128). */
export function constantTileBase64(cm: number): string {
  const bytes = new Uint8Array(128 * 128 * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < 128 * 128; i++) view.setInt16(i * 2, cm, true)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** fixtureFull plus the terrain plan fields: terrain settings, two tiles (one at a negative index), a stair and a preset. */
export function fixtureTerrain(): CampusDocument {
  const doc = fixtureFull()
  doc.terrain = {
    reference: { name: 'Sea level (TopoExport)', zeroMeaning: 'Mean sea level' },
    grid: { originLat: 11.6795, originLng: 122.3695 },
    colorRange: { minM: 0, maxM: 40 },
  }
  doc.terrainTiles = { '0_0': constantTileBase64(150), '-1_0': constantTileBase64(-20) }
  doc.structurePresets = [{
    id: 'preset-plain-stair',
    name: 'Plain stair',
    form: 'stairs',
    shape: { width: 1.5, underneath: 'open', railings: 'both' },
    look: { tread: 'concrete', side: 'concrete-side', under: 'concrete-under', railing: 'painted-green', railingStyle: 'posts-rails' },
  }]
  doc.structures = [
    {
      id: 'stair-1', form: 'stairs', presetId: 'preset-plain-stair',
      start: { kind: 'slab', buildingId: doc.buildings[0].id, floorId: doc.buildings[0].floors[0].id, edgeIndex: 0, edgeT: 0.5 },
      end: { kind: 'ground', position: { lat: 11.6801, lng: 122.3702 } },
      width: 1.5, underneath: 'open', railings: 'both',
    },
    {
      id: 'stair-0', form: 'stairs', presetId: 'preset-plain-stair',
      start: { kind: 'ground', position: { lat: 11.6802, lng: 122.3703 } },
      end: { kind: 'ground', position: { lat: 11.6803, lng: 122.3704 } },
      width: 2, underneath: 'solid', railings: 'left',
    },
  ]
  return doc
}

// ── fixtureWith15Violations ─────────────────────────────────────────────────

/** fixtureFull plus the content NAVI 1.5 forbids in saved data (for negative tests). */
export function fixtureWith15Violations(): CampusDocument {
  const doc = fixtureFull()
  doc.panoramas.push({
    id: 'pano-1',
    label: 'Library 360',
    position: ll(10, 10),
    heading: 0,
    imageAssetId: 'asset:pano-1',
    hotspots: [],
  })
  const floors = doc.buildings[0].floors
  floors[0].textureId = 'tex-1'
  floors[1].svgOverlayId = 'svg-1'
  floors[0].rooms[0].metadata = {
    ...floors[0].rooms[0].metadata,
    embeddedImage: 'data:image/png;base64,AAA',
  }
  return doc
}

// ── fixtureLegacyShape ───────────────────────────────────────────────────────

/**
 * A pre-optional-array document: every optional array/object is ABSENT (key not
 * present), not `[]`. Only required keys (and the required per-floor arrays).
 */
export function fixtureLegacyShape(): CampusDocument {
  const floor = (id: string, level: number): Floor =>
    ({
      id,
      level,
      label: `Level ${level}`,
      elevation: level * 4,
      height: 3.5,
      rooms: [
        {
          id: `${id}-room`,
          name: `Room ${level}01`,
          number: `${level}01`,
          category: 'classroom',
          polygon: localRect(-12, -8, 0, 4),
          roomDoors: [
            {
              id: `${id}-room-door`,
              roomId: `${id}-room`,
              connectedToId: `${id}-hall`,
              connectedToType: 'hallway',
              doorType: 'standard',
              position: { x: -6, y: 4 },
              width: 1.2,
              metadata: {},
            },
          ],
          metadata: {},
        },
      ],
      hallways: [{ id: `${id}-hall`, name: 'Hallway', polyline: { points: [{ x: -14, y: 6 }, { x: 14, y: 6 }] }, width: 3 }],
      staircases: [],
      elevators: [],
      entrances:
        level === 0
          ? [{ id: `${id}-ent`, label: 'Entrance', position: { x: 14, y: 6 }, level, type: 'main', hasQR: false, hasPanorama: false, connectorRoadId: 'road-legacy' }]
          : [],
      connectorStops: [
        { id: `${id}-stop`, connectorId: 'conn-legacy', position: { x: 10, y: 6 }, anchors: [], accessible: true, metadata: {} },
      ],
      parametricComponents: [],
      metadata: {},
    }) as unknown as Floor

  return {
    schemaVersion: 1,
    version: 7,
    metadata: { ...FIXED_METADATA, campusId: 'legacy-campus', name: 'Legacy Campus', description: '' },
    buildings: [
      {
        id: 'bld-legacy',
        name: 'Legacy Hall',
        code: 'LEG',
        category: 'academic',
        description: '',
        footprint: worldRect(0, 0, 30, 20),
        baseElevation: 0,
        height: 8,
        floors: [floor('leg-f0', 0), floor('leg-f1', 1)],
        verticalConnectors: [{ id: 'conn-legacy', type: 'staircase', name: 'Stair', stopIds: ['leg-f0-stop', 'leg-f1-stop'], accessible: true, metadata: {} }],
        color: '#cc3333',
        aliases: [],
        metadata: {},
      },
    ],
    roads: [
      {
        id: 'road-legacy',
        name: 'Legacy Road',
        polyline: { points: [ll(35, -10), ll(35, 30)] },
        width: 6,
        surface: 'paved',
        type: 'connector',
        metadata: {},
      },
    ],
    panoramas: [],
    qrCheckpoints: [],
  }
}

// ── fixtureLarge ─────────────────────────────────────────────────────────────

/** mulberry32: small deterministic PRNG so the large fixture is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

function largeBuilding(index: number, rng: () => number, floorCount: number, wallsPerFloor: number): Building {
  const col = index % 10
  const row = Math.floor(index / 10)
  const floors: Floor[] = []
  for (let level = 0; level < floorCount; level++) {
    const walls = []
    for (let w = 0; w < wallsPerFloor; w++) {
      const x = round2(-18 + rng() * 36)
      const y = round2(-10 + rng() * 20)
      walls.push({
        id: `b${index}-f${level}-w${w}`,
        start: { x, y },
        end: { x: round2(x + rng() * 4), y: round2(y + rng() * 4) },
        thickness: 0.15,
        height: 3.5,
        metadata: { seq: w },
      })
    }
    floors.push({
      id: `b${index}-f${level}`,
      level,
      label: `Floor ${level}`,
      elevation: level * 3.5,
      height: 3.5,
      walls,
      rooms: [
        {
          id: `b${index}-f${level}-room`,
          name: `Room ${index}.${level}`,
          number: `${index}${level}`,
          category: 'classroom',
          polygon: localRect(-12, -8, 0, 4),
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
      metadata: {},
    } as unknown as Floor)
  }
  return {
    id: `large-b${index}`,
    name: `Large Building ${index}`,
    code: `L${index}`,
    category: 'academic',
    description: '',
    footprint: worldRect(col * 60, row * 40, 40, 24),
    baseElevation: 0,
    height: floorCount * 3.5,
    floors,
    verticalConnectors: [],
    color: '#8888cc',
    aliases: [],
    metadata: {},
  }
}

/**
 * Generated campus: many buildings x floors x walls, deterministic (seeded),
 * with `JSON.stringify(result).length >= targetBytes`.
 */
export function fixtureLarge(targetBytes = 3_000_000): CampusDocument {
  const rng = mulberry32(0x5eed)
  const floorCount = 5
  const wallsPerFloor = 120
  const buildings: Building[] = []
  // Each building is stringified once to track size; the document envelope adds a
  // small constant overhead, so stop once the running total clears the target.
  let bytes = 2_000
  let index = 0
  while (bytes < targetBytes + 1_000) {
    const building = largeBuilding(index, rng, floorCount, wallsPerFloor)
    bytes += JSON.stringify(building).length + 1
    buildings.push(building)
    index++
  }
  return createDocument({
    version: 1,
    metadata: { ...FIXED_METADATA, campusId: 'large-campus', name: 'Large Campus' },
    buildings,
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  })
}
