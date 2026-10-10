import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublicStore } from '@/store/public-store'
import { PublicCampusRuntimeStatus } from '../PublicCampusRuntimeStatus'

const runtime = vi.hoisted(() => ({ map: null as unknown, isReady: true, isActive: true, hostRequested: true }))
vi.mock('../NavigationMap', () => ({ useNavigationMap: () => runtime }))

const layers = [
  'buildings-fill', 'buildings-outline', 'buildings-extrusion', 'buildings-labels',
  'pois-layer', 'pois-outdoor-fill', 'pois-outdoor-outline', 'pois-outdoor-extrusion',
  'authored-roads-outline', 'authored-roads-fill', 'authored-roads-path',
]
function makeMap() {
  const listeners = new Map<string, Set<() => void>>()
  let attached = false
  let loaded = false
  let populated = false
  let sourceFeatures: Record<string, Array<{ id: string }>> = {}
  return {
    isStyleLoaded: () => true,
    getSource: (source: string) => attached ? {
      getData: async () => ({
        type: 'FeatureCollection',
        features: populated ? sourceFeatures[source] ?? [{ id: 'b1' }] : [],
      }),
    } : undefined,
    getLayer: (id: string) => attached && layers.includes(id) ? { id } : undefined,
    isSourceLoaded: () => loaded,
    on: (event: string, handler: () => void) => {
      const handlers = listeners.get(event) ?? new Set()
      handlers.add(handler)
      listeners.set(event, handlers)
    },
    off: (event: string, handler: () => void) => { listeners.get(event)?.delete(handler) },
    emit: (event: string) => { for (const handler of listeners.get(event) ?? []) handler() },
    set: (next: {
      attached: boolean
      loaded: boolean
      populated: boolean
      sourceFeatures?: Record<string, Array<{ id: string }>>
    }) => {
      ({ attached, loaded, populated } = next)
      if (next.sourceFeatures) sourceFeatures = next.sourceFeatures
    },
  }
}

describe('public campus map loading contract', () => {
  beforeEach(() => {
    runtime.hostRequested = true
    runtime.isActive = true
    runtime.map = makeMap()
    usePublicStore.setState({ campus: {
      buildings: [{ id: 'b1', name: 'Hall', campusId: 'campus', floors: [0], baseElevation: 0, height: 3, footprint: [{ lat: 10, lng: 20 }, { lat: 10, lng: 20.001 }, { lat: 10.001, lng: 20 }] }],
      nodes: [], edges: [], poi: [], searchEntries: [], boundingBox: null,
    }, campusStatus: 'ready', campusError: null })
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('keeps loading until the required building data is attached and processed', async () => {
    const map = runtime.map as ReturnType<typeof makeMap>
    render(<PublicCampusRuntimeStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading campus map')
    await act(async () => {
      map.set({ attached: true, loaded: false, populated: true })
      map.emit('styledata')
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => {
      map.set({ attached: true, loaded: true, populated: true })
      map.emit('sourcedata')
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('public-campus-runtime-state')).toHaveAttribute('data-state', 'interactive')
  })

  it('does not declare an empty building source ready', async () => {
    const map = runtime.map as ReturnType<typeof makeMap>
    map.set({ attached: true, loaded: true, populated: false })
    render(<PublicCampusRuntimeStatus />)
    await act(async () => { map.emit('idle') })
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => {
      map.set({ attached: true, loaded: true, populated: true })
      map.emit('idle')
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('waits for authored roads and outdoor POIs to attach and process before becoming interactive', async () => {
    const map = runtime.map as ReturnType<typeof makeMap>
    usePublicStore.setState({ campus: {
      buildings: [{ id: 'b1', name: 'Hall', campusId: 'campus', floors: [0], baseElevation: 0, height: 3, footprint: [{ lat: 10, lng: 20 }, { lat: 10, lng: 20.001 }, { lat: 10.001, lng: 20 }] }],
      nodes: [], edges: [], searchEntries: [], boundingBox: null,
      poi: [{
        id: 'p1', label: 'Gate', category: 'entrance', scope: 'outdoor',
        position: { lat: 10, lng: 20 }, properties: {},
      }],
      traces: [{
        id: 'road-1', floor: 0, type: 'arterial',
        points: [{ lat: 10, lng: 20 }, { lat: 10.001, lng: 20.001 }],
      }],
    } })
    map.set({
      attached: true,
      loaded: true,
      populated: true,
      sourceFeatures: { buildings: [{ id: 'b1' }], pois: [], 'authored-roads': [] },
    })

    render(<PublicCampusRuntimeStatus />)
    await act(async () => { map.emit('idle') })
    expect(screen.getByRole('status')).toHaveTextContent('Loading campus map')

    await act(async () => {
      map.set({
        attached: true,
        loaded: true,
        populated: true,
        sourceFeatures: {
          buildings: [{ id: 'b1' }],
          pois: [{ id: 'p1' }],
          'authored-roads': [{ id: 'road-1' }],
        },
      })
      map.emit('sourcedata')
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('public-campus-runtime-state')).toHaveAttribute('data-state', 'interactive')
  })

  it('returns to loading after a style reload until the campus is reattached', async () => {
    const map = runtime.map as ReturnType<typeof makeMap>
    map.set({ attached: true, loaded: true, populated: true })
    render(<PublicCampusRuntimeStatus />)
    await act(async () => { map.emit('idle') })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await act(async () => {
      map.set({ attached: false, loaded: false, populated: false })
      map.emit('style.load')
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => {
      map.set({ attached: true, loaded: true, populated: true })
      map.emit('idle')
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers recovery if required campus layers never become ready', async () => {
    vi.useFakeTimers()
    render(<PublicCampusRuntimeStatus />)
    await act(async () => { vi.advanceTimersByTime(20_000) })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload campus map' })).toBeEnabled()
  })

  it('offers recovery when campus data stalls before map creation, then accepts loaded data', async () => {
    vi.useFakeTimers()
    runtime.hostRequested = false
    runtime.map = null
    usePublicStore.setState({ campus: null, campusStatus: 'loading', campusLoading: true })
    const view = render(<PublicCampusRuntimeStatus />)
    await act(async () => { vi.advanceTimersByTime(20_000) })
    expect(screen.getByRole('button', { name: 'Reload campus map' })).toBeEnabled()
    const map = makeMap()
    map.set({ attached: true, loaded: true, populated: true })
    runtime.map = map
    runtime.hostRequested = true
    await act(async () => {
      usePublicStore.setState({ campus: { buildings: [{ id: 'b1', name: 'Hall', campusId: 'campus', floors: [0], baseElevation: 0, height: 3, footprint: [{ lat: 10, lng: 20 }, { lat: 10, lng: 20.001 }, { lat: 10.001, lng: 20 }] }], nodes: [], edges: [], poi: [], searchEntries: [], boundingBox: null }, campusStatus: 'ready', campusLoading: false })
      view.rerender(<PublicCampusRuntimeStatus />)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('public-campus-runtime-state')).toHaveAttribute('data-state', 'interactive')
  })
})
