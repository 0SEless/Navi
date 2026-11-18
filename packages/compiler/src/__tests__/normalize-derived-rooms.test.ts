import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { deriveRooms } from '@navi/editor/src/geometry/room-derivation'
import { normalizeDocument } from '../normalize'
import { CampusCompiler } from '../pipeline/campus-compiler'

// Owner 2026-11-18: "why is there no route or room searching?" ASU's rooms are drawn as walls (faces) named through
// roomAttributes; floor.rooms is empty, so the compiler made no room points and no room could be routed to. A named
// face becomes a room, with the doors on its outline.

// Two rooms side by side (x 0..5 and 5..10, y 0..4) and a corridor below them (y -2..0).
const walls = [
  { id: 'w-top', start: { x: 0, y: 4 }, end: { x: 10, y: 4 } },
  { id: 'w-mid', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
  { id: 'w-bot', start: { x: 0, y: -2 }, end: { x: 10, y: -2 } },
  { id: 'w-left', start: { x: 0, y: -2 }, end: { x: 0, y: 4 } },
  { id: 'w-right', start: { x: 10, y: -2 }, end: { x: 10, y: 4 } },
  { id: 'w-split', start: { x: 5, y: 0 }, end: { x: 5, y: 4 } },
].map((w) => ({ ...w, thickness: 0.15, height: 3 }))

const faces = deriveRooms(walls.map((w) => ({ id: w.id, sourceWallId: w.id, start: w.start, end: w.end })), [])
const faceAt = (x: number, y: number) => faces.find((f) => {
  const xs = f.polygon.points.map((p) => p.x), ys = f.polygon.points.map((p) => p.y)
  return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys)
})!

function doc(extraRooms: unknown[] = []): CampusDocument {
  return {
    schemaVersion: 1, version: 1, roads: [], panoramas: [], qrCheckpoints: [],
    metadata: { campusId: 'c', name: 'c', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'b1', name: 'Admin', code: '', category: 'academic', description: '', baseElevation: 0, height: 10, color: '#ccc', aliases: [], metadata: {},
      footprint: { points: [{ lat: 14, lng: 121 }, { lat: 14, lng: 121.001 }, { lat: 14.001, lng: 121.001 }, { lat: 14.001, lng: 121 }] },
      verticalConnectors: [],
      floors: [{
        id: 'f0', level: 0, label: 'GF', elevation: 0, hallways: [], staircases: [], elevators: [], connectorStops: [], entrances: [], metadata: {},
        rooms: extraRooms, walls,
        doors: [
          { id: 'door-left', position: { x: 2.5, y: 0 }, width: 1, doorType: 'standard', wallAttachment: { wallId: 'w-mid', offset: 2 }, ownership: { status: 'unassigned' }, metadata: {}, routeConnection: { anchorNodeId: 'rn-door-left' } },
          { id: 'door-right', position: { x: 7.5, y: 0 }, width: 1, doorType: 'standard', wallAttachment: { wallId: 'w-mid', offset: 7 }, ownership: { status: 'unassigned' }, metadata: {} },
        ],
        roomAttributes: [
          { roomId: 'room-ed101', faceId: faceAt(2.5, 2).faceId, name: 'ED101', code: '', type: 'Classroom', searchable: true },
          { roomId: 'room-ed102', faceId: faceAt(7.5, 2).faceId, name: 'ED102', code: '102', type: 'Classroom', searchable: true },
          { roomId: 'room-hidden', faceId: faceAt(5, -1).faceId, name: 'Corridor', searchable: false },
        ],
      }],
    }],
  } as unknown as CampusDocument
}

describe('rooms drawn as walls (named faces) become routable rooms', () => {
  it('a named, searchable face becomes a room at its centre with the doors on its outline', () => {
    const rooms = normalizeDocument(doc()).document.buildings[0]!.floors[0]!.rooms
    expect(rooms.map((r) => r.name).sort()).toEqual(['ED101', 'ED102'])
    const ed101 = rooms.find((r) => r.name === 'ED101')!
    expect(ed101.id).toBe('room-ed101')
    expect(ed101.doors.map((d) => d.id)).toEqual(['door-left'])
    // The door keeps its saved route connection, so the room joins the corridor network there.
    expect(ed101.doors[0].properties?.routeConnection).toEqual({ anchorNodeId: 'rn-door-left' })
    const ed102 = rooms.find((r) => r.name === 'ED102')!
    expect(ed102.number).toBe('102')
    expect(ed102.doors.map((d) => d.id)).toEqual(['door-right'])
  })

  it('a floor with drawn rooms keeps them as they are', () => {
    const legacy = [{ id: 'r1', name: 'Room 101', number: '101', category: 'classroom', polygon: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }, roomDoors: [], metadata: {} }]
    const rooms = normalizeDocument(doc(legacy)).document.buildings[0]!.floors[0]!.rooms
    expect(rooms.map((r) => r.name)).toEqual(['Room 101'])
  })
})

describe('search has each named room once, with its route point', () => {
  it('ED101 is one entry (no "ED101 ()" twin) and it routes', () => {
    const result = new CampusCompiler().compileV2(doc())
    const entries = result.artifacts!.searchIndex!.entries.filter((e) => /ED101/.test(e.label))
    expect(entries.map((e) => e.label)).toEqual(['ED101'])
    expect(entries[0].nodeId).toMatch(/^N-/)
  })

  it('a room whose code is its name is named once ("CS202", not "CS202 (CS202)")', () => {
    const d = doc()
    const ra = (d.buildings[0].floors[0] as unknown as { roomAttributes: Array<{ name: string; code: string }> }).roomAttributes
    ra[0].code = 'ED101'
    const result = new CampusCompiler().compileV2(d)
    const node = result.artifacts!.graph!.nodes.find((n) => n.type === 'poi' && n.label.startsWith('ED101'))
    expect(node?.label).toBe('ED101')
    expect(result.artifacts!.searchIndex!.entries.find((e) => e.label.startsWith('ED101'))?.nodeId).toBe(node?.id)
  })
})
