import { describe, expect, it } from 'vitest'
import type { NavEdge, NavNode } from '@/types/nav-types'
import { findCanonicalRoutePath } from '../canonical-routing-adapter'

function node(id: string): NavNode {
  return {
    id,
    label: id,
    position: { lat: 14.6, lng: 121 },
    floor: 0,
    buildingId: '',
    campusId: 'campus',
    type: 'outdoor',
  }
}

function edge(
  id: string,
  from: string,
  to: string,
  distance: number,
  routing?: NavEdge['routing'],
): NavEdge {
  return { id, from, to, distance, weight: distance, type: 'walk', routing }
}

describe('Studio canonical routing adapter', () => {
  it('uses canonical terrain semantics while returning physical UI distance', () => {
    const routing = {
      sourceRoadId: 'steep-shortcut',
      authoredOrientation: 'forward' as const,
      authored: { slope: 'steep' as const },
    }
    const result = findCanonicalRoutePath(
      [node('a'), node('b'), node('c')],
      [
        edge('direct', 'a', 'c', 100, routing),
        edge('alt-a', 'a', 'b', 55),
        edge('alt-b', 'b', 'c', 55),
      ],
      'a',
      'c',
    )

    expect(result?.path).toEqual(['a', 'b', 'c'])
    expect(result?.cost).toBe(110)
    expect(result?.generalizedCost).toBe(110)
  })

  it('preserves authored direction and passive wheelchair behavior', () => {
    const routing = {
      sourceRoadId: 'one-way',
      authoredOrientation: 'forward' as const,
      authored: {
        direction: 'forward' as const,
        wheelchairAccessible: false,
      },
    }
    const nodes = [node('a'), node('b')]
    const edges = [edge('one-way', 'a', 'b', 10, routing)]

    expect(findCanonicalRoutePath(nodes, edges, 'a', 'b')?.path).toEqual(['a', 'b'])
    expect(findCanonicalRoutePath(nodes, edges, 'b', 'a')).toBeNull()
  })

  it('reports the selected physical distance for parallel edges', () => {
    const blocked = {
      sourceRoadId: 'blocked',
      authoredOrientation: 'forward' as const,
      authored: { walkable: false },
    }
    const result = findCanonicalRoutePath(
      [node('a'), node('b')],
      [edge('blocked-shortcut', 'a', 'b', 5, blocked), edge('eligible', 'a', 'b', 20)],
      'a',
      'b',
    )

    expect(result?.cost).toBe(20)
    expect(result?.steps[1]?.distance).toBe(20)
    expect(result?.steps[1]?.edgeId).toBe('eligible')
  })

  it('never walks through a room (owner 2026-11-18: the route cut through CS201 instead of using the stair)', () => {
    // NAVI Web loads a room's point as type 'room' (the compiler's 'poi').
    const room = { ...node('room'), type: 'room' as const }
    const nodes = [node('a'), node('b'), node('c'), node('d'), room]
    const edges = [
      // Shortcut through the room's two doors.
      edge('in', 'a', 'room', 5), edge('out', 'room', 'd', 5),
      // The long way round (the stair).
      edge('s1', 'a', 'b', 20), edge('s2', 'b', 'c', 20), edge('s3', 'c', 'd', 20),
    ]
    expect(findCanonicalRoutePath(nodes, edges, 'a', 'd')?.path).toEqual(['a', 'b', 'c', 'd'])
    // The room is still a destination (and a start).
    expect(findCanonicalRoutePath(nodes, edges, 'a', 'room')?.path).toEqual(['a', 'room'])
    expect(findCanonicalRoutePath(nodes, edges, 'room', 'd')?.path).toEqual(['room', 'd'])
  })
})
