import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NavigationInspector, computeGraphHealth, computeRouteSteps } from '../RouteTesting'
import type { NavNode, NavEdge } from '@/types/nav-types'

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      addControl = vi.fn()
      on = vi.fn()
      fitBounds = vi.fn()
      remove = vi.fn()
    },
    NavigationControl: vi.fn(),
    LngLatBounds: class {
      extend = vi.fn()
    },
  },
}))

vi.mock('@/store/compiled-graph-store', () => ({
  useCompiledGraphStore: vi.fn(() => ({
    nodes: [],
    edges: [],
    hasRealData: false,
    loadFromStorage: vi.fn(),
    result: null,
  })),
}))

vi.mock('../RouteOverlay', () => ({
  RouteOverlay: vi.fn(() => null),
}))

describe('NavigationInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with Route tab active by default', () => {
    render(<NavigationInspector />)
    expect(screen.getByText('Route')).toBeInTheDocument()
    expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    expect(screen.getByText('ROUTE CONFIGURATION')).toBeInTheDocument()
  })

  it('switches to Diagnostics tab on click', () => {
    render(<NavigationInspector />)
    fireEvent.click(screen.getByText('Diagnostics'))
    expect(screen.getByText('PUBLISHED SNAPSHOT')).toBeInTheDocument()
  })
})

describe('computeGraphHealth', () => {
  const baseNode = (id: string): NavNode => ({
    id, label: id, name: id, type: 'room', buildingId: 'b1', campusId: 'c1', floor: 1,
    position: { lat: 11.8, lng: 122.17 }, hasQr: false, hasPanorama: false,
  })

  const edge = (id: string, from: string, to: string): NavEdge => ({
    id, from, to, distance: 100, type: 'walkway',
  })

  it('returns healthy for fully connected graph', () => {
    const nodes = [baseNode('A'), baseNode('B'), baseNode('C'), baseNode('D')]
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'D'), edge('e4', 'D', 'A')]
    const h = computeGraphHealth(nodes, edges)
    expect(h.disconnected).toBe(0)
    expect(h.isolated).toBe(0)
    expect(h.components).toBe(1)
    expect(h.warnings).toHaveLength(0)
  })

  it('detects isolated nodes', () => {
    const nodes = [baseNode('A'), baseNode('B'), baseNode('C')]
    const edges = [edge('e1', 'A', 'B')]
    const h = computeGraphHealth(nodes, edges)
    expect(h.isolated).toBe(1)
    expect(h.warnings.some(w => w.message.includes('isolated'))).toBe(true)
  })

  it('counts components correctly', () => {
    const nodes = [baseNode('A'), baseNode('B'), baseNode('C'), baseNode('D')]
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'C', 'D')]
    const h = computeGraphHealth(nodes, edges)
    expect(h.components).toBe(2)
    expect(h.disconnected).toBe(0)
    expect(h.isolated).toBe(0)
  })
})

describe('computeRouteSteps', () => {
  const node = (id: string, label: string, type: NavNode['type']): NavNode => ({
    id, label, name: label, type, position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c',
  })

  const edge = (id: string, from: string, to: string, distance: number, type: NavEdge['type'] = 'walkway'): NavEdge => ({
    id, from, to, distance, type,
  })

  it('computes route steps with distances', () => {
    const nodes = [
      node('A', 'Entrance', 'entrance'),
      node('B', 'Waypoint', 'room'),
      node('C', 'Room', 'room'),
    ]
    const edges = [
      edge('E1', 'A', 'B', 100),
      edge('E2', 'B', 'C', 80),
    ]
    const steps = computeRouteSteps(['A', 'B', 'C'], nodes, edges)
    expect(steps).toHaveLength(3)
    expect(steps[0].instruction).toBe('Start')
    expect(steps[1].distance).toBe(100)
    expect(steps[2].instruction).toBe('Destination')
  })

  it('generates correct instructions for node types', () => {
    const nodes = [
      node('A', 'Start', 'outdoor'),
      node('B', 'Entry', 'entrance'),
      node('C', 'Stairs', 'staircase'),
      node('D', 'Lift', 'elevator'),
      node('E', 'End', 'room'),
    ]
    const edges = [
      edge('E1', 'A', 'B', 50),
      edge('E2', 'B', 'C', 10),
      edge('E3', 'C', 'D', 10),
      edge('E4', 'D', 'E', 10),
    ]
    const steps = computeRouteSteps(['A', 'B', 'C', 'D', 'E'], nodes, edges)
    expect(steps[0].instruction).toBe('Start')
    expect(steps[1].instruction).toBe('Enter building')
    expect(steps[2].instruction).toBe('Use stairs')
    expect(steps[3].instruction).toBe('Use elevator')
    expect(steps[4].instruction).toBe('Destination')
  })

  it('uses node name over label over id', () => {
    const nodes = [
      { id: 'X', name: 'Full Name', label: 'Short', type: 'room' as NavNode['type'], position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b', campusId: 'c' },
    ]
    const steps = computeRouteSteps(['X'], nodes, [])
    expect(steps[0].nodeLabel).toBe('Full Name')
  })

  it('falls back to id when name and label are missing', () => {
    const nodes = [
      { id: 'Z', label: '', type: 'room' as NavNode['type'], position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b', campusId: 'c' },
    ]
    const steps = computeRouteSteps(['Z'], nodes, [])
    expect(steps[0].nodeLabel).toBe('Z')
  })

  it('sets edge to null for the first node', () => {
    const nodes = [node('A', 'A', 'outdoor'), node('B', 'B', 'room')]
    const edges = [edge('E1', 'A', 'B', 100)]
    const steps = computeRouteSteps(['A', 'B'], nodes, edges)
    expect(steps[0].edge).toBeNull()
    expect(steps[0].distance).toBe(0)
  })

  it('finds bidirectional edges', () => {
    const nodes = [node('A', 'A', 'outdoor'), node('B', 'B', 'room')]
    const edges = [edge('E1', 'B', 'A', 55)]
    const steps = computeRouteSteps(['A', 'B'], nodes, edges)
    expect(steps[1].edge).not.toBeNull()
    expect(steps[1].distance).toBe(55)
  })
})
