import { CampusDocument, Building, Floor, Room, Hallway, Entrance } from '@navi/core'

const BUILDING_CENTROID = { lat: 12.345, lng: 121.234 }

function localToWorld(local: { x: number; y: number }, origin: { lat: number; lng: number }): { lat: number; lng: number } {
  const latPerMeter = 1 / 111320
  const lngPerMeter = 1 / (111320 * Math.cos(origin.lat * Math.PI / 180))
  return {
    lat: origin.lat + local.y * latPerMeter,
    lng: origin.lng + local.x * lngPerMeter,
  }
}

export function createGoldenCampus(): CampusDocument {
  const buildingId = 'bldg-a'
  const floorLevel = 1
  const floorId = 'fl-1'
  const toWorld = (p: { x: number; y: number }) => localToWorld(p, BUILDING_CENTROID)

  const room101: Room = {
    id: 'room-101', name: 'Room 101', number: '101', category: 'classroom',
    polygon: [{ x: -5, y: -5 }, { x: 3, y: -5 }, { x: 3, y: 1 }, { x: -5, y: 1 }],
    entrancePosition: { x: 3, y: -2 }, capacity: 30,
  }

  const room102: Room = {
    id: 'room-102', name: 'Room 102', number: '102', category: 'classroom',
    polygon: [{ x: 17, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 1 }, { x: 17, y: 1 }],
    entrancePosition: { x: 17, y: -2 }, capacity: 30,
  }

  const hallway: Hallway = {
    id: 'hallway-h1', name: 'Main Hallway',
    polyline: [{ x: 0, y: 0 }, { x: 20, y: 0 }], width: 3,
  }

  const entrance: Entrance = {
    id: 'entrance-e1', name: 'Main Entrance',
    position: toWorld({ x: 10, y: 5 }), level: floorLevel, type: 'building',
  }

  const floor: Floor = {
    id: floorId, level: floorLevel, label: 'Floor 1', elevation: 0,
    rooms: [room101, room102], hallways: [hallway],
    staircases: [], elevators: [], entrances: [entrance],
  }

  const building: Building = {
    id: buildingId, name: 'Building A', code: 'BLA', category: 'academic',
    footprint: {
      points: [
        toWorld({ x: -8, y: -8 }), toWorld({ x: 28, y: -8 }),
        toWorld({ x: 28, y: 8 }), toWorld({ x: -8, y: 8 }),
      ],
    },
    baseElevation: 0, height: 10, floors: [floor], aliases: ['Building Alpha'],
  }

  return {
    schemaVersion: 1, version: 1,
    metadata: {
      name: 'Demo Campus',
      description: 'Golden Campus for walking skeleton E2E testing',
      lastModified: new Date().toISOString(),
      editorVersion: '1.0.0',
    },
    buildings: [building], roads: [], panoramas: [], qrCheckpoints: [],
  }
}
