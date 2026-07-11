import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import maplibregl from 'maplibre-gl'
import { MapRenderer, getInitialMapStyle } from '../rendering/MapRenderer'
import { SRC } from '../rendering/constants'

vi.mock('@/store/graph-store', () => {
  const current = {
    graph: {
      nodes: [],
      edges: [],
      buildings: [],
      traces: [],
      getNode: vi.fn(),
      toJSON: vi.fn(() => ({ nodes: [], edges: [], version: '1', campusId: 'test' })),
    },
    renderVersion: 0,
  }
  const mockFn: any = (selector: any) => selector(current)
  mockFn.getState = () => current
  mockFn.subscribe = vi.fn()
  mockFn.setState = vi.fn()
  return { useGraphStore: mockFn }
})

vi.mock('@/store/studio-store', () => {
  const current = {
    activeFloor: 0,
    layers: {
      osm: true,
      satellite: false,
      floor_plan: true,
      buildings: true,
      rooms: true,
      hallways: true,
      assets: true,
      nodes: true,
      edges: true,
      labels: true,
    },
    isVertexEditing: false,
  }
  const mockFn: any = (selector: any) => selector(current)
  mockFn.getState = () => current
  mockFn.subscribe = vi.fn()
  mockFn.setState = vi.fn()
  return { useStudioStore: mockFn }
})

function createMockMap() {
  const sources = new Map<string, unknown>()
  return {
    getSource: vi.fn((id: string) => sources.get(id) ?? null),
    addSource: vi.fn((id: string, _spec: unknown) => {
      sources.set(id, { setData: vi.fn() })
    }),
    addLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    remove: vi.fn(),
    getStyle: vi.fn(() => ({ sources: {}, layers: [] })),
    setStyle: vi.fn(),
    setLayoutProperty: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
    getZoom: vi.fn(() => 10),
    getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
    project: vi.fn(() => ({ x: 0, y: 0 })),
    queryRenderedFeatures: vi.fn(() => []),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
  } as unknown as maplibregl.Map
}

describe('MapRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates sources and layers on mount', () => {
    const map = createMockMap()
    render(<MapRenderer map={map} />)

    expect(map.addSource).toHaveBeenCalledWith(SRC.BUILDINGS, expect.any(Object))
    expect(map.addSource).toHaveBeenCalledWith(SRC.EDGES, expect.any(Object))
    expect(map.addSource).toHaveBeenCalledWith(SRC.NODES, expect.any(Object))
    expect(map.addSource).toHaveBeenCalledWith(SRC.NODES_CONNECTION, expect.any(Object))
    expect(map.addSource).toHaveBeenCalledWith(SRC.TRACES, expect.any(Object))
    expect(map.addLayer).toHaveBeenCalled()
  })

  it('is idempotent — does not create duplicate sources on re-render', () => {
    const map = createMockMap()
    // Simulate existing sources
    vi.mocked(map.getSource).mockReturnValue({ setData: vi.fn() } as any)

    const { rerender } = render(<MapRenderer map={map} />)

    vi.mocked(map.addSource).mockClear()

    rerender(<MapRenderer map={map} />)

    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('pushes data to sources on mount', () => {
    const map = createMockMap()
    const setDataFns: (() => void)[] = []

    map.addSource = vi.fn((id: string, _spec: unknown) => {
      const setData = vi.fn()
      const src = { setData }
      vi.mocked(map.getSource).mockImplementation((sid: string) =>
        sid === id ? (src as any) : (map.getSource as any).getMock?.() ?? null,
      )
      setDataFns.push(setData)
    }) as any

    render(<MapRenderer map={map} />)

    expect(map.getSource).toHaveBeenCalledWith(SRC.BUILDINGS)
    expect(map.getSource).toHaveBeenCalledWith(SRC.EDGES)
    expect(map.getSource).toHaveBeenCalledWith(SRC.NODES)
    expect(map.getSource).toHaveBeenCalledWith(SRC.NODES_CONNECTION)
    expect(map.getSource).toHaveBeenCalledWith(SRC.TRACES)
  })

  it('registers style.load listener', () => {
    const map = createMockMap()
    render(<MapRenderer map={map} />)

    expect(map.on).toHaveBeenCalledWith('style.load', expect.any(Function))
  })

  it('handles map without sources gracefully (no crash)', () => {
    const map = createMockMap()
    vi.mocked(map.getSource).mockReturnValue(null)

    expect(() => render(<MapRenderer map={map} />)).not.toThrow()
  })

  it('applies layer visibility on mount', () => {
    const map = createMockMap()
    render(<MapRenderer map={map} />)

    // Should have called setLayoutProperty for each layer
    expect(map.setLayoutProperty).toHaveBeenCalled()
  })

  it('exports getInitialMapStyle for StudioCanvas bootstrap', () => {
    const style = getInitialMapStyle()
    expect(style).toBeDefined()
    expect(style.version).toBe(8)
  })
})
