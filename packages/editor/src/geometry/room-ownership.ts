import type { LocalCoord } from '@navi/core'
import { deriveRooms } from './room-derivation'
import { wallsToSegments } from './wall-to-segment'

export interface RoomOwnershipPolygon { id: string; points: LocalCoord[] }

export type RoomOwnershipResolution =
  | { status: 'assigned'; roomId: string }
  | { status: 'unassigned' }
  | { status: 'ambiguous'; candidateRoomIds: string[] }

function pointOnSegment(point: LocalCoord, a: LocalCoord, b: LocalCoord): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)
  if (Math.abs(cross) > 1e-8) return false
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)
  return dot >= 0 && dot <= (b.x - a.x) ** 2 + (b.y - a.y) ** 2
}

function containsPoint(points: LocalCoord[], point: LocalCoord): boolean {
  if (points.length < 3) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]
    const b = points[i]
    if (pointOnSegment(point, a, b)) return true
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      if (point.x < x) inside = !inside
    }
  }
  return inside
}

/** Generic unique-owner resolver reusable by every future room-owned asset. */
export function resolveUniqueRoomOwner(point: LocalCoord, rooms: RoomOwnershipPolygon[]): RoomOwnershipResolution {
  const ids = rooms.filter(room => containsPoint(room.points, point)).map(room => room.id).sort()
  if (ids.length === 0) return { status: 'unassigned' }
  if (ids.length === 1) return { status: 'assigned', roomId: ids[0] }
  return { status: 'ambiguous', candidateRoomIds: ids }
}

type OwnershipFloor = {
  rooms: Array<{ id: string; polygon: { points: LocalCoord[] } }>
  walls?: Array<{ id: string; start: LocalCoord; end: LocalCoord; thickness: number; height: number }>
  roomAttributes?: Array<{ faceId: string; roomId?: string }>
}

/** Prefer semantic wall-derived Rooms when present; legacy polygons are fallback only. */
export function collectFloorRoomOwnershipPolygons(floor: OwnershipFloor, includeUnassignedDerived = false): RoomOwnershipPolygon[] {
  if (floor.walls?.length && (floor.roomAttributes?.length || includeUnassignedDerived)) {
    const identityByFace = new Map((floor.roomAttributes ?? []).map(attributes => [attributes.faceId, attributes.roomId]))
    return deriveRooms(wallsToSegments(floor.walls), [])
      .filter(room => Boolean(room.faceId))
      .flatMap(room => {
        const roomId = identityByFace.get(room.faceId!)
        if (!roomId && !includeUnassignedDerived) return []
        return [{ id: roomId ?? room.faceId!, points: room.polygon.points }]
      })
  }
  return floor.rooms.map(room => ({ id: room.id, points: room.polygon.points }))
}
