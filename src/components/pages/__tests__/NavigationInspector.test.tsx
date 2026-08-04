import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NavigationInspector, computeGraphHealth } from '../RouteTesting'
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
