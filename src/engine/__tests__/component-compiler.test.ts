import { describe, it, expect } from 'vitest'
import { compileComponent } from '../component-compiler'
import type { Component, Building } from '@/types/nav-types'

describe('compileComponent polygon output', () => {
  const building: Building = {
    id: 'BLD01', name: 'Test', description: '',
    center: { lat: 11.8195, lng: 122.0922 }, floors: 3,
  }
  const buildings = new Map<string, Building>([['BLD01', building]])

  it('compileRoom returns polygon with 4 vertices', () => {
    const room: Component = {
      id: 'C001', type: 'room', name: 'Room 101',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.8195, lng: 122.0922 },
      dimensions: { width: 6, height: 8 },
    }
    const result = compileComponent(room, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C001',
    })
    expect(result.polygon).toBeDefined()
    expect(result.polygon!.length).toBe(4)
    // Polygon should form a closed rectangle around the center
    const poly = result.polygon!
    expect(poly[0].lat).toBeLessThan(room.position.lat) // SW
    expect(poly[2].lat).toBeGreaterThan(room.position.lat) // NE
  })

  it('compileRoom outputs center node + 4 wall edges', () => {
    const room: Component = {
      id: 'C002', type: 'room', name: 'Lab 1',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.8195, lng: 122.0922 },
      dimensions: { width: 4, height: 5 },
    }
    const result = compileComponent(room, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C002',
    })
    expect(result.nodes.length).toBe(5) // 4 corners + 1 center
    expect(result.nodes.filter(n => n.type === 'room')).toHaveLength(1)
    expect(result.nodes.filter(n => n.type === 'corner')).toHaveLength(4)
    // Wall edges
    const wallEdges = result.edges.filter(e => e.type === 'wall')
    expect(wallEdges).toHaveLength(4)
  })

  it('compileRestroom also returns polygon', () => {
    const restroom: Component = {
      id: 'C003', type: 'restroom', name: 'CR 1',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.8195, lng: 122.0922 },
      dimensions: { width: 3, height: 3 },
    }
    const result = compileComponent(restroom, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C003',
    })
    expect(result.polygon).toBeDefined()
    expect(result.polygon!.length).toBe(4)
  })

  it('compileStair does not return polygon', () => {
    const stair: Component = {
      id: 'C004', type: 'stair', name: 'Stair A',
      buildingId: 'BLD01', floor: 0,
      position: { lat: 11.8195, lng: 122.0922 },
    }
    const result = compileComponent(stair, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C004',
    })
    expect(result.polygon).toBeUndefined()
  })
})
