import { describe, it, expect } from 'vitest'
import type { TracePath, NavNode, NavEdge } from '@/types/nav-types'
import { compileTrace } from '../trace-compiler'

describe('compileTrace', () => {
  const hallway: TracePath = {
    id: 'T001',
    name: 'Main Hallway',
    buildingId: 'BLD01',
    floor: 1,
    points: [
      { lat: 11.8195, lng: 122.0922 },
      { lat: 11.8196, lng: 122.0923 },
      { lat: 11.8197, lng: 122.0924 },
    ],
    type: 'connector',
  }

  it('generates endpoint nodes for a simple trace', () => {
    const result = compileTrace(hallway, [], [], [])
    expect(result.nodes.length).toBeGreaterThanOrEqual(2)
    const firstNode = result.nodes[0]
    expect(firstNode.type).toBe('intersection')
    expect(firstNode.floor).toBe(1)
    expect(firstNode.buildingId).toBe('BLD01')
  })

  it('generates edges between consecutive nodes', () => {
    const result = compileTrace(hallway, [], [], [])
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    for (const edge of result.edges) {
      expect(edge.type).toBe('walk')
    }
  })

  it('generates nodes at intersection points', () => {
    const existingTrace: TracePath = {
      id: 'T002',
      floor: 1,
      points: [
        { lat: 11.8190, lng: 122.0923 },
        { lat: 11.8200, lng: 122.0923 },
      ],
      type: 'connector',
    }
    const result = compileTrace(hallway, [existingTrace], [], [])
    const intersectionNodes = result.nodes.filter(
      (n) => n.metadata?.source === 'intersection'
    )
    expect(intersectionNodes.length).toBeGreaterThanOrEqual(1)
  })

  it('generates edges to existing room entrance nodes within proximity', () => {
    const roomNode: NavNode = {
      id: 'N010', label: 'Room 101', name: 'Room 101', type: 'room',
      buildingId: 'BLD01', campusId: 'asu-ibajay', floor: 1,
      position: { lat: 11.81955, lng: 122.09225 },
    }
    const result = compileTrace(hallway, [], [roomNode], [])
    const hasRoomConnection = result.edges.some(
      (e) => e.to === 'N010' || e.from === 'N010'
    )
    expect(hasRoomConnection).toBe(true)
  })

  it('does not duplicate existing edges', () => {
    const firstResult = compileTrace(hallway, [], [], [])
    const firstEdge = firstResult.edges[0]
    const existingEdges: NavEdge[] = [firstEdge]
    const secondResult = compileTrace(hallway, [], [], existingEdges)
    const duplicateCount = secondResult.edges.filter(
      (e) => e.from === firstEdge.from && e.to === firstEdge.to
    ).length
    expect(duplicateCount).toBe(0)
  })
})
