import { beforeEach, describe, expect, it } from 'vitest'
import { roomIdOfSearchEntry, usePublicStore } from '../public-store'

describe('a room picked from the list or search', () => {
  beforeEach(() => usePublicStore.setState({ focusedRoom: null, indoorContext: { active: false }, selectedBuilding: null, viewedFloorId: null }))

  it('reads the room id behind a search entry', () => {
    expect(roomIdOfSearchEntry({ id: 'search_room_room-11-i5np' })).toBe('room-11-i5np')
    expect(roomIdOfSearchEntry({ id: 'room-7' })).toBe('room-7')
  })

  it('opens that room\'s building on its floor and remembers the room to highlight', () => {
    usePublicStore.getState().focusRoom({ roomId: 'room-11', buildingId: 'cs', floor: 1 })
    const s = usePublicStore.getState()
    expect(s.focusedRoom).toEqual({ roomId: 'room-11', buildingId: 'cs', floor: 1 })
    expect(s.indoorContext).toEqual({ active: true, buildingId: 'cs', floorId: 1 })
    expect(s.activeFloor).toBe(1)
  })

  it('forgets the room when the building closes', () => {
    usePublicStore.getState().focusRoom({ roomId: 'room-11', buildingId: 'cs', floor: 1 })
    usePublicStore.getState().exitIndoorContext()
    expect(usePublicStore.getState().focusedRoom).toBeNull()
  })
})
