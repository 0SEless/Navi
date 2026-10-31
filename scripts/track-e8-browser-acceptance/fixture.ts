import type { CampusDocument } from '@navi/core'

function floor(id: string, level: number) {
  return {
    id,
    level,
    label: level === 0 ? 'Ground Floor' : 'Second Floor',
    shortLabel: level === 0 ? 'GF' : '2F',
    elevation: level === 0 ? 0 : 3.5,
    height: 3.5,
    visible: true,
    locked: false,
    rooms: [],
    hallways: [],
    staircases: [],
    elevators: [],
    entrances: [],
    connectorStops: [],
    parametricComponents: [],
  }
}

function building(id: string, name: string, code: string, baseLng: number) {
  return {
    id,
    name,
    code,
    category: 'academic' as const,
    description: `Synthetic ${name}`,
    footprint: { points: [
      { lat: 14.6, lng: baseLng },
      { lat: 14.6, lng: baseLng + 0.001 },
      { lat: 14.601, lng: baseLng + 0.001 },
      { lat: 14.601, lng: baseLng },
      { lat: 14.6, lng: baseLng },
    ] },
    baseElevation: 0,
    height: 10,
    floors: [floor(`${id}-floor-0`, 0), floor(`${id}-floor-1`, 1)],
    verticalConnectors: [],
    verticalTransitions: [],
    color: '#4682b4',
    aliases: [],
    metadata: {},
  }
}

export function createE8BrowserCampusDocument(campusId: string): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    // The editor's GraphAdapter normalizes absent values to this contract
    // version at hydration. Seed it explicitly so the acceptance baseline
    // represents the document users actually edit and a building-only change
    // cannot spuriously create a campus-settings operation.
    connectivitySemanticsVersion: '1.0.0',
    metadata: { campusId, name: 'NAVI E8 Synthetic Campus', description: 'Synthetic browser acceptance fixture', lastModified: '2026-10-30T00:00:00.000Z', editorVersion: '1.5-test' },
    buildings: [
      building('e8-building-library', 'Synthetic Library', 'LIB', 121.05),
      building('e8-building-lab', 'Unchanged Synthetic Lab', 'LAB', 121.052),
    ] as unknown as CampusDocument['buildings'],
    roads: [],
    roadJunctions: [],
    separatedCrossings: [],
    panoramas: [],
    qrCheckpoints: [],
    areas: [],
    boundary: { points: [
      { lat: 14.599, lng: 121.049 },
      { lat: 14.603, lng: 121.049 },
      { lat: 14.603, lng: 121.054 },
      { lat: 14.599, lng: 121.049 },
    ] },
  }
}

/** Minimal valid single-building fixture used by the E8.4 publish workflow. */
export function createE84BrowserCampusDocument(campusId: string): CampusDocument {
  const document = createE8BrowserCampusDocument(campusId)
  document.buildings = [document.buildings[0]]
  return document
}

/** E8.5 publish/runtime fixture adds a tiny authored route so the real compiler emits a usable building index. */
export function createE85BrowserCampusDocument(campusId: string): CampusDocument {
  const document = createE84BrowserCampusDocument(campusId)
  document.buildings[0].floors[0].entrances = [{
    id: 'e85-runtime-entrance',
    label: 'Synthetic west entrance',
    position: { lat: 14.6005, lng: 121.05 } as never,
    level: 0,
    type: 'main',
    hasQR: false,
    hasPanorama: false,
  }]
  document.buildings[0].floors[0].routeNetwork = {
    nodes: [
      { id: 'e85-runtime-node-a', type: 'waypoint', position: { x: 0, y: 0 }, floor: 0 },
      { id: 'e85-runtime-node-b', type: 'waypoint', position: { x: 8, y: 0 }, floor: 0 },
    ],
    edges: [{ id: 'e85-runtime-edge-ab', from: 'e85-runtime-node-a', to: 'e85-runtime-node-b', type: 'walk', distance: 8 }],
  }
  return document
}

/** Actual-editor routing fixture for E8.3 (kept separate from E8.2 baseline). */
export function createE83BrowserCampusDocument(campusId: string): CampusDocument {
  const document = createE8BrowserCampusDocument(campusId)
  document.buildings[0].floors[0].routeNetwork = {
    nodes: [
      { id: 'e83-route-node-a', type: 'waypoint', position: { x: 0, y: 0 }, floor: 0 },
      { id: 'e83-route-node-b', type: 'waypoint', position: { x: 8, y: 0 }, floor: 0 },
    ],
    edges: [{ id: 'e83-route-edge-ab', from: 'e83-route-node-a', to: 'e83-route-node-b', type: 'walk', distance: 8 }],
  }
  document.roads = [{
    id: 'e83-synthetic-road',
    name: 'Synthetic Loop Road',
    polyline: { points: [{ lat: 14.602, lng: 121.05 }, { lat: 14.602, lng: 121.051 }] },
    width: 4,
    surface: 'concrete',
    type: 'connector',
    metadata: {},
  }]
  return document
}

export function createE8BrowserGraphSnapshot(campusId: string, document = createE8BrowserCampusDocument(campusId)) {
  return {
    id: campusId,
    version: '1.0.0',
    campusId,
    updatedAt: '2026-10-30T00:00:00.000Z',
    buildings: document.buildings.map((value) => structuredClone(value)),
    nodes: [],
    edges: [],
    components: [],
    traces: [],
    areas: structuredClone(document.areas ?? []),
    boundary: structuredClone(document.boundary?.points ?? []),
    authoredDocumentFormatVersion: 1,
    authoredDocument: structuredClone(document),
  }
}

export function createE8BrowserCampusMap(campusId: string) {
  return {
    id: campusId,
    name: 'NAVI E8 Synthetic Campus',
    schoolName: 'NAVI Synthetic QA',
    campusName: 'E8 Local Acceptance',
    boundary: createE8BrowserCampusDocument(campusId).boundary?.points ?? [],
    center: { lat: 14.6, lng: 121.051 },
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
    stats: { buildings: 2, nodes: 0, edges: 0 },
  }
}
