import type { Building, CampusBundle, Component, LatLng, NavEdge, NavNode } from '@/types/nav-types'

export const NAVI_V22_PREVIEW_CAMPUS_ID = 'navi-v22-preview'

const CAMPUS_ID = NAVI_V22_PREVIEW_CAMPUS_ID

function point(lat: number, lng: number): LatLng {
  return { lat, lng }
}

function footprint(lat: number, lng: number, halfSize = 0.000045): LatLng[] {
  return [
    point(lat - halfSize, lng - halfSize),
    point(lat - halfSize, lng + halfSize),
    point(lat + halfSize, lng + halfSize),
    point(lat + halfSize, lng - halfSize),
  ]
}

function node(
  id: string,
  label: string,
  lat: number,
  lng: number,
  floor: number,
  buildingId: string,
  type: NavNode['type'],
): NavNode {
  return { id, label, position: point(lat, lng), floor, buildingId, campusId: CAMPUS_ID, type }
}

function edge(id: string, from: string, to: string, distance: number, type: NavEdge['type']): NavEdge {
  return { id, from, to, distance, weight: distance, type, campusId: CAMPUS_ID }
}

const teacherLat = 11.81905
const teacherLng = 121.9189

const buildings: Building[] = [
  {
    id: 'teacher-education',
    name: 'Teacher Education',
    code: 'TE',
    campusId: CAMPUS_ID,
    floors: [0, 1, 2],
    footprint: footprint(teacherLat, teacherLng, 0.00011),
    baseElevation: 0,
    height: 9,
    category: 'academic',
    color: '#5BBF91',
    entrances: [{ id: 'teacher-main-entry', position: point(teacherLat - 0.00009, teacherLng), floor: 0, label: 'Main entrance' }],
  },
  {
    id: 'library', name: 'Library', code: 'LIB', campusId: CAMPUS_ID, floors: [0],
    footprint: footprint(11.81882, 121.91848), baseElevation: 0, height: 4, category: 'facility', color: '#65A8E8',
  },
  {
    id: 'gymnasium', name: 'Gymnasium', code: 'GYM', campusId: CAMPUS_ID, floors: [0],
    footprint: footprint(11.81898, 121.91845), baseElevation: 0, height: 7, category: 'facility', color: '#65A8E8',
  },
  {
    id: 'administration', name: 'Administration', code: 'ADMIN', campusId: CAMPUS_ID, floors: [0],
    footprint: footprint(11.81868, 121.91873), baseElevation: 0, height: 5, category: 'office', color: '#F0D668',
  },
  {
    id: 'tourism', name: 'Tourism Building', code: 'TOUR', campusId: CAMPUS_ID, floors: [0],
    footprint: footprint(11.81892, 121.91915), baseElevation: 0, height: 5, category: 'academic', color: '#E98A87',
  },
]

const nodes: NavNode[] = [
  node('main-gate', 'Main Gate', 11.81855, 121.9181, 0, CAMPUS_ID, 'entrance'),
  node('west-walk', 'West Walkway', 11.81872, 121.91838, 0, CAMPUS_ID, 'outdoor'),
  node('campus-junction', 'Campus Junction', 11.81886, 121.91863, 0, CAMPUS_ID, 'intersection'),
  node('gym-entrance', 'Gymnasium', 11.81898, 121.91845, 0, 'gymnasium', 'building_entrance'),
  node('library-entrance', 'Library', 11.81882, 121.91848, 0, 'library', 'building_entrance'),
  node('admin-entrance', 'Administration', 11.81868, 121.91873, 0, 'administration', 'building_entrance'),
  node('teacher-main-entry', 'Teacher Education entrance', teacherLat - 0.00009, teacherLng, 0, 'teacher-education', 'building_entrance'),
  node('gf-hall', 'Ground floor hallway', teacherLat - 0.000025, teacherLng, 0, 'teacher-education', 'hallway'),
  node('stairs-gf', 'Stairs', teacherLat, teacherLng - 0.000045, 0, 'teacher-education', 'stair'),
  node('stairs-1f', 'Stairs', teacherLat, teacherLng - 0.000045, 1, 'teacher-education', 'stair'),
  node('stairs-2f', 'Stairs', teacherLat, teacherLng - 0.000045, 2, 'teacher-education', 'stair'),
  node('lift-gf', 'Lift', teacherLat, teacherLng + 0.000045, 0, 'teacher-education', 'elevator'),
  node('lift-1f', 'Lift', teacherLat, teacherLng + 0.000045, 1, 'teacher-education', 'elevator'),
  node('lift-2f', 'Lift', teacherLat, teacherLng + 0.000045, 2, 'teacher-education', 'elevator'),
  node('2f-hall', 'Second floor hallway', teacherLat + 0.000035, teacherLng, 2, 'teacher-education', 'hallway'),
  node('room-204', 'Room 204', teacherLat + 0.000055, teacherLng + 0.000065, 2, 'teacher-education', 'room'),
]

const edges: NavEdge[] = [
  edge('gate-west', 'main-gate', 'west-walk', 45, 'outdoor'),
  edge('west-junction', 'west-walk', 'campus-junction', 38, 'outdoor'),
  edge('junction-gym', 'campus-junction', 'gym-entrance', 28, 'outdoor'),
  edge('junction-library', 'campus-junction', 'library-entrance', 30, 'outdoor'),
  edge('junction-admin', 'campus-junction', 'admin-entrance', 24, 'outdoor'),
  edge('junction-teacher', 'campus-junction', 'teacher-main-entry', 52, 'outdoor'),
  edge('entry-hall', 'teacher-main-entry', 'gf-hall', 12, 'hallway'),
  edge('hall-stairs', 'gf-hall', 'stairs-gf', 8, 'hallway'),
  edge('hall-lift', 'gf-hall', 'lift-gf', 12, 'hallway'),
  edge('stairs-gf-1f', 'stairs-gf', 'stairs-1f', 4, 'stair'),
  edge('stairs-1f-2f', 'stairs-1f', 'stairs-2f', 4, 'stair'),
  edge('lift-gf-1f', 'lift-gf', 'lift-1f', 9, 'elevator'),
  edge('lift-1f-2f', 'lift-1f', 'lift-2f', 9, 'elevator'),
  edge('stairs-hall-2f', 'stairs-2f', '2f-hall', 7, 'hallway'),
  edge('lift-hall-2f', 'lift-2f', '2f-hall', 11, 'hallway'),
  edge('hall-room-204', '2f-hall', 'room-204', 9, 'hallway'),
]

const components: Component[] = [
  { id: 'gf-hall-area', type: 'hallway', name: 'Ground floor corridor', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 0, position: point(teacherLat - 0.000025, teacherLng), polygon: footprint(teacherLat - 0.000025, teacherLng, 0.000025) },
  { id: '1f-hall-area', type: 'hallway', name: 'First floor corridor', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 1, position: point(teacherLat - 0.000025, teacherLng), polygon: footprint(teacherLat - 0.000025, teacherLng, 0.000025) },
  { id: '2f-hall-area', type: 'hallway', name: 'Second floor corridor', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 2, position: point(teacherLat + 0.000035, teacherLng), polygon: footprint(teacherLat + 0.000035, teacherLng, 0.000025) },
  { id: 'stairs-gf-area', type: 'stair', name: 'Stairs', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 0, position: point(teacherLat, teacherLng - 0.000045), polygon: footprint(teacherLat, teacherLng - 0.000045, 0.000018), featureId: 'main-stairs' },
  { id: 'stairs-1f-area', type: 'stair', name: 'Stairs', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 1, position: point(teacherLat, teacherLng - 0.000045), polygon: footprint(teacherLat, teacherLng - 0.000045, 0.000018), featureId: 'main-stairs' },
  { id: 'stairs-2f-area', type: 'stair', name: 'Stairs', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 2, position: point(teacherLat, teacherLng - 0.000045), polygon: footprint(teacherLat, teacherLng - 0.000045, 0.000018), featureId: 'main-stairs' },
  { id: 'lift-gf-area', type: 'elevator', name: 'Lift', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 0, position: point(teacherLat, teacherLng + 0.000045), polygon: footprint(teacherLat, teacherLng + 0.000045, 0.000018), featureId: 'main-lift' },
  { id: 'lift-1f-area', type: 'elevator', name: 'Lift', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 1, position: point(teacherLat, teacherLng + 0.000045), polygon: footprint(teacherLat, teacherLng + 0.000045, 0.000018), featureId: 'main-lift' },
  { id: 'lift-2f-area', type: 'elevator', name: 'Lift', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 2, position: point(teacherLat, teacherLng + 0.000045), polygon: footprint(teacherLat, teacherLng + 0.000045, 0.000018), featureId: 'main-lift' },
  { id: 'room-204-area', type: 'room', name: 'Room 204', buildingId: 'teacher-education', campusId: CAMPUS_ID, floor: 2, position: point(teacherLat + 0.000055, teacherLng + 0.000065), polygon: footprint(teacherLat + 0.000055, teacherLng + 0.000065, 0.000018) },
]

export const naviV22PreviewBoundary = {
  points: [point(11.81848, 121.91798), point(11.81926, 121.91798), point(11.81926, 121.91936), point(11.81848, 121.91936)],
}

export const naviV22PreviewCampus: CampusBundle = {
  campusName: 'DEMO DATA · NAVI V2.2 Preview',
  nodes,
  edges,
  searchEntries: [
    { id: 'teacher-education', label: 'Teacher Education', type: 'building', nodeId: 'teacher-main-entry', buildingId: 'teacher-education', position: point(teacherLat, teacherLng) },
    { id: 'library', label: 'Library', type: 'building', nodeId: 'library-entrance', buildingId: 'library', position: point(11.81882, 121.91848) },
    { id: 'gymnasium', label: 'Gymnasium', type: 'building', nodeId: 'gym-entrance', buildingId: 'gymnasium', position: point(11.81898, 121.91845) },
    { id: 'administration', label: 'Administration', type: 'building', nodeId: 'admin-entrance', buildingId: 'administration', position: point(11.81868, 121.91873) },
    { id: 'room-204', label: 'Room 204', type: 'room', nodeId: 'room-204', buildingId: 'teacher-education', floor: 2, position: point(teacherLat + 0.000055, teacherLng + 0.000065) },
    { id: 'main-gate', label: 'Main Gate', type: 'entrance', nodeId: 'main-gate', position: point(11.81855, 121.9181), floor: 0 },
  ],
  buildings,
  components,
  poi: [],
  boundingBox: { minLat: 11.81848, maxLat: 11.81926, minLng: 121.91798, maxLng: 121.91936 },
}
