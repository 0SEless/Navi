import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEditor, useEditingEngine } from '@navi/editor'
import { useStudioStore } from '@/store/studio-store'
import { useVertexEditor } from '../useVertexEditor'

const mockUseEditor = vi.hoisted(() => vi.fn())
const mockUseEditingEngine = vi.hoisted(() => vi.fn())
const mockAutosave = vi.hoisted(() => ({
  setTransientInteractionActive: vi.fn(),
}))

vi.mock('@navi/editor', () => ({
  useEditor: mockUseEditor,
  useEditingEngine: mockUseEditingEngine,
}))

type Source = {
  data: GeoJSON.FeatureCollection
  setData: (data: GeoJSON.FeatureCollection) => void
}

function createMapDouble() {
  const sources = new Map<string, Source>()
  const layers = new Set<string>()
  const listeners = new Map<string, Set<(event?: any) => void>>()
  const canvasListeners = new Map<string, Set<(event?: any) => void>>()

  function listenersFor(event: string) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    return listeners.get(event)!
  }

  function canvasListenersFor(event: string) {
    if (!canvasListeners.has(event)) canvasListeners.set(event, new Set())
    return canvasListeners.get(event)!
  }

  const canvas = {
    addEventListener: vi.fn((event: string, handler: (event?: any) => void) => {
      canvasListenersFor(event).add(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: (event?: any) => void) => {
      canvasListeners.get(event)?.delete(handler)
    }),
  }

  const map = {
    getSource: vi.fn((id: string) => sources.get(id) ?? null),
    getCanvas: vi.fn(() => canvas),
    addSource: vi.fn((id: string, definition: { data: GeoJSON.FeatureCollection }) => {
      const source: Source = {
        data: definition.data,
        setData(data) { source.data = data },
      }
      sources.set(id, source)
    }),
    getLayer: vi.fn((id: string) => layers.has(id) ? { id } : null),
    addLayer: vi.fn((definition: { id: string }) => { layers.add(definition.id) }),
    moveLayer: vi.fn(),
    queryRenderedFeatures: vi.fn(() => [{ properties: { index: 0 } }]),
    on: vi.fn((event: string, handler: (event?: any) => void) => {
      listenersFor(event).add(handler)
    }),
    off: vi.fn((event: string, handler: (event?: any) => void) => {
      listeners.get(event)?.delete(handler)
    }),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
  }

  return {
    map,
    sources,
    reloadStyle() {
      sources.clear()
      layers.clear()
      for (const listener of listenersFor('style.load')) listener()
    },
    emit(event: string, payload?: any) {
      for (const listener of listenersFor(event)) listener(payload)
    },
    emitCanvas(event: string, payload?: any) {
      for (const listener of canvasListenersFor(event)) listener(payload)
    },
    canvas,
  }
}

const road = {
  id: 'road-1',
  name: 'Main Road',
  polyline: {
    points: [
      { lat: 33.42, lng: -111.93 },
      { lat: 33.421, lng: -111.929 },
    ],
  },
  width: 6,
  surface: 'paved',
  type: 'arterial',
  metadata: {},
} as any

let dispatcherExecute = vi.fn()
let workflowSave = vi.fn()

describe('useVertexEditor', () => {
  beforeEach(() => {
    dispatcherExecute = vi.fn()
    workflowSave = vi.fn()
    mockUseEditor.mockReturnValue({
      document: { roads: [road] },
      services: {
        get: (id: string) => {
          if (id === 'dispatcher') return { execute: dispatcherExecute }
          if (id === 'workflow') return { save: workflowSave }
          if (id === 'autosave') return mockAutosave
          return undefined
        },
      },
    })
    mockUseEditingEngine.mockReturnValue({ begin: vi.fn(), doCommit: vi.fn() })
    useStudioStore.setState({
      isVertexEditing: false,
      editTargetType: null,
      editTargetId: null,
      tool: 'select',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockAutosave.setTransientInteractionActive.mockClear()
    useStudioStore.setState({
      isVertexEditing: false,
      editTargetType: null,
      editTargetId: null,
      tool: 'select',
    })
  })

  it('repaints the selected road vertices after a MapLibre style reload', () => {
    const harness = createMapDouble()
    renderHook(() => useVertexEditor(harness.map as any))

    act(() => {
      useStudioStore.getState().setVertexEditing('trace', road.id)
    })

    expect(harness.sources.get('vertex-source')?.data.features).toHaveLength(4)

    act(() => {
      harness.reloadStyle()
    })

    const features = harness.sources.get('vertex-source')?.data.features ?? []
    expect(features.filter((feature) => feature.geometry.type === 'Point')).toHaveLength(3)
    expect(features.some((feature) => feature.geometry.type === 'LineString')).toBe(true)
  })

  it('persists a dragged route vertex through the road update command', () => {
    const harness = createMapDouble()
    renderHook(() => useVertexEditor(harness.map as any))

    act(() => {
      useStudioStore.getState().setVertexEditing('trace', road.id)
    })

    const start = road.polyline.points[0]
    const moved = { lat: start.lat + 0.00005, lng: start.lng }
    harness.emit('mousedown', {
      point: { x: 10, y: 10 },
      lngLat: start,
      originalEvent: { button: 0 },
    })
    harness.emit('mousemove', {
      point: { x: 18, y: 10 },
      lngLat: moved,
      originalEvent: { button: 0 },
    })
    harness.emit('mouseup')

    expect(dispatcherExecute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'entity.update',
      payload: {
        entityId: road.id,
        changes: { polyline: { points: [moved, road.polyline.points[1]] } },
      },
    }))
    expect(workflowSave).toHaveBeenCalledWith('manual')
  })

  it('gates autosave only while a route vertex is actually moving', () => {
    const harness = createMapDouble()
    renderHook(() => useVertexEditor(harness.map as any))

    act(() => {
      useStudioStore.getState().setVertexEditing('trace', road.id)
    })

    const start = road.polyline.points[0]
    harness.emit('mousedown', {
      point: { x: 10, y: 10 },
      lngLat: start,
      originalEvent: { button: 0 },
    })
    expect(mockAutosave.setTransientInteractionActive).not.toHaveBeenCalledWith(true)

    harness.emit('mousemove', {
      point: { x: 18, y: 10 },
      lngLat: { lat: start.lat + 0.00005, lng: start.lng },
      originalEvent: { button: 0 },
    })
    expect(mockAutosave.setTransientInteractionActive).toHaveBeenLastCalledWith(true)

    harness.emit('mouseup')
    expect(mockAutosave.setTransientInteractionActive).toHaveBeenLastCalledWith(false)
  })

  it('releases the autosave gate when vertex editing is cancelled or unmounted', () => {
    const harness = createMapDouble()
    const rendered = renderHook(() => useVertexEditor(harness.map as any))
    act(() => {
      useStudioStore.getState().setVertexEditing('trace', road.id)
    })

    const start = road.polyline.points[0]
    harness.emit('mousedown', { point: { x: 10, y: 10 }, lngLat: start, originalEvent: { button: 0 } })
    harness.emit('mousemove', { point: { x: 18, y: 10 }, lngLat: { lat: start.lat + 0.00005, lng: start.lng }, originalEvent: { button: 0 } })
    harness.emitCanvas('pointercancel')
    expect(mockAutosave.setTransientInteractionActive).toHaveBeenLastCalledWith(false)

    harness.emit('mousedown', { point: { x: 10, y: 10 }, lngLat: start, originalEvent: { button: 0 } })
    harness.emit('mousemove', { point: { x: 18, y: 10 }, lngLat: { lat: start.lat + 0.00005, lng: start.lng }, originalEvent: { button: 0 } })
    rendered.unmount()
    expect(mockAutosave.setTransientInteractionActive).toHaveBeenLastCalledWith(false)
  })
})
