import { describe, expect, it } from 'vitest'
import { collectFloorRoomOwnershipPolygons, resolveUniqueRoomOwner } from '../room-ownership'

const square = (id: string, minX: number, maxX: number) => ({
  id,
  points: [{ x: minX, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: 10 }, { x: minX, y: 10 }],
})

describe('reusable room ownership contract', () => {
  it('assigns exactly one containing room', () => {
    expect(resolveUniqueRoomOwner({ x: 2, y: 5 }, [square('a', 0, 4), square('b', 6, 10)])).toEqual({ status: 'assigned', roomId: 'a' })
  })

  it('returns explicit unassigned outside all rooms', () => {
    expect(resolveUniqueRoomOwner({ x: 5, y: 5 }, [square('a', 0, 4), square('b', 6, 10)])).toEqual({ status: 'unassigned' })
  })

  it('does not silently choose when containment is ambiguous', () => {
    expect(resolveUniqueRoomOwner({ x: 3, y: 5 }, [square('a', 0, 5), square('b', 2, 7)])).toEqual({ status: 'ambiguous', candidateRoomIds: ['a', 'b'] })
  })

  it('uses semantic Room identities from wall-derived faces', () => {
    const floor = {
      rooms: [],
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.15, height: 3 },
        { id: 'w2', start: { x: 4, y: 0 }, end: { x: 4, y: 4 }, thickness: 0.15, height: 3 },
        { id: 'w3', start: { x: 4, y: 4 }, end: { x: 0, y: 4 }, thickness: 0.15, height: 3 },
        { id: 'w4', start: { x: 0, y: 4 }, end: { x: 0, y: 0 }, thickness: 0.15, height: 3 },
      ],
      roomAttributes: [{ faceId: 'placeholder', roomId: 'semantic-room', name: 'Lab', searchable: true }],
    }
    const withoutIdentity = collectFloorRoomOwnershipPolygons(floor)
    expect(withoutIdentity).toEqual([])

    const derivedFaceId = collectFloorRoomOwnershipPolygons({ ...floor, roomAttributes: undefined }, true)[0]?.id
    floor.roomAttributes[0].faceId = derivedFaceId
    expect(resolveUniqueRoomOwner({ x: 2, y: 2 }, collectFloorRoomOwnershipPolygons(floor))).toEqual({ status: 'assigned', roomId: 'semantic-room' })
  })
})
