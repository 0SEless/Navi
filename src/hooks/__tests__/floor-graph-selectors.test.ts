import { describe, expect, it } from 'vitest'
import type { CampusDocument, CoordinateTransformer } from '@navi/core'
import { extractFloorComponents, resolveFloorScope } from '../floor-graph-selectors'

const transformer = {
  buildingLocalToWorld: (point: { x: number; y: number }) => ({ lat: point.y, lng: point.x }),
} as unknown as CoordinateTransformer

const floors = [
  {
    id: 'floor-ground', level: -1, label: 'Ground Floor',
    rooms: [{ id: 'room-ground', name: 'Room-G', polygon: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } }],
    hallways: [], staircases: [], elevators: [], entrances: [],
  },
  {
    id: 'floor-one', level: 2, label: '1F',
    rooms: [{ id: 'room-one', name: 'Room-1', polygon: { points: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }] } }],
    hallways: [], staircases: [], elevators: [], entrances: [],
  },
  {
    id: 'floor-two', level: 7, label: '2F',
    rooms: [{ id: 'room-two', name: 'Room-2', polygon: { points: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }] } }],
    hallways: [], staircases: [], elevators: [], entrances: [],
  },
]

const doc = {
  buildings: [{ id: 'building-1', floors }],
} as unknown as CampusDocument

describe('active floor scope', () => {
  it('uses canonical floor identity when the floor index differs from Floor.level', () => {
    // Index 1 is the 1F floor, but its actual persisted level is 2.
    expect(resolveFloorScope(floors, 'floor-one', 1)?.level).toBe(2)
  })

  it('keeps the GF → 1F → 2F → GF component projection isolated by floor ID', () => {
    const expected = [
      ['floor-ground', 'room-ground'],
      ['floor-one', 'room-one'],
      ['floor-two', 'room-two'],
      ['floor-ground', 'room-ground'],
    ]

    for (const [floorId, expectedRoomId] of expected) {
      const floor = resolveFloorScope(floors, floorId)
      expect(floor).toBeDefined()
      const components = extractFloorComponents(doc, 'building-1', floor!, transformer)
      expect(components.map((component) => component.id)).toEqual([expectedRoomId])
    }
  })

  it('does not fall back to a different level when an explicit floor ID is missing', () => {
    expect(resolveFloorScope(floors, 'stale-floor-id', 2)).toBeUndefined()
  })
})

describe('floor-to-floor stairs in the floor editor (2026-11-16)', () => {
  const drawing = { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape' } }
  const stairDoc = {
    buildings: [{ id: 'building-1', floors, staircases: [{ id: 'u', buildingId: 'building-1', name: 'U', type: 'standard', accessible: false, fromLevel: 2, toLevel: 7,
      levels: { 2: { position: { x: 1, y: 1 }, rotation: 0, drawing }, 7: { role: 'top', position: { x: 3, y: 1 }, rotation: 0 } } }] }],
  } as unknown as CampusDocument

  it('the From floor lists the stair with its outline; the upper floor lists only its top point', () => {
    const one = extractFloorComponents(stairDoc, 'building-1', floors[1], transformer).filter(c => c.type === 'stair')
    expect(one).toHaveLength(1)
    expect(one[0].polygon?.length).toBeGreaterThanOrEqual(4)
    expect(one[0].metadata?.role).toBeUndefined()
    const two = extractFloorComponents(stairDoc, 'building-1', floors[2], transformer).filter(c => c.type === 'stair')
    expect(two).toHaveLength(1)
    expect(two[0].metadata?.role).toBe('top')
    expect(two[0].polygon).toBeUndefined()
    expect(two[0].position).toEqual({ lat: 1, lng: 3 })
  })
})
