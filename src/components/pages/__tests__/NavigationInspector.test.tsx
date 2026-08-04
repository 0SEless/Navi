import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NavigationInspector } from '../RouteTesting'

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
