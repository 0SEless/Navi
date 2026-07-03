import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloorEditorCanvas } from '../FloorEditorCanvas'
import type { Building } from '@/types/nav-types'
import type { LayerVisibility } from '@/types/studio-types'

let mockGraphComponents: unknown[] = []
let mockRemoveComponent = vi.fn()
let mockUpdateComponent = vi.fn()
let mockSaveGraph = vi.fn()

vi.mock('maplibre-gl', () => {
  class MockLngLatBounds {
    private _ne: [number, number]
    private _sw: [number, number]
    constructor(sw?: [number, number], ne?: [number, number]) {
      this._sw = sw ?? [0, 0]
      this._ne = ne ?? [0, 0]
    }
    extend() { return this }
    getNorthEast() { return { lng: this._ne[0], lat: this._ne[1] } }
    getSouthWest() { return { lng: this._sw[0], lat: this._sw[1] } }
  }

  class MockEvented {
    private _handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    private _sources: Record<string, Record<string, unknown>> = {}
    private _layers: Record<string, Record<string, unknown>> = {}
    private _layoutProps: Record<string, Record<string, unknown>> = {}
    private _canvas: HTMLCanvasElement

    style: Record<string, unknown> = {}
    loaded = () => true
    fitBounds = () => {}
    once = () => {}
    getCenter = () => ({ lng: 0, lat: 0 })
    getZoom = () => 15
    setCenter = () => {}
    setZoom = () => {}

    constructor() {
      this._canvas = document.createElement('canvas')
    }

    on(event: string, layer?: unknown, handler?: (...args: unknown[]) => void) {
      const fn = typeof layer === 'function' ? layer : handler!
      if (!this._handlers[event]) this._handlers[event] = []
      this._handlers[event].push(fn)
    }

    off(event: string, layer?: unknown, handler?: (...args: unknown[]) => void) {
      const fn = typeof layer === 'function' ? layer : handler!
      if (!this._handlers[event]) return
      this._handlers[event] = this._handlers[event].filter((h) => h !== fn)
    }

    fire(event: string, ...args: unknown[]) {
      for (const h of this._handlers[event] ?? []) h(...args)
    }

    getSource(id: string) { return this._sources[id] ?? null }
    addSource(id: string) { this._sources[id] = {} }
    addLayer(layer: Record<string, unknown>) { this._layers[layer.id as string] = layer }
    getLayer(id: string) { return this._layers[id] ?? null }
    setLayoutProperty(layer: string, prop: string, value: unknown) {
      if (!this._layoutProps[layer]) this._layoutProps[layer] = {}
      this._layoutProps[layer][prop] = value
    }
    getCanvas() { return this._canvas }
    queryRenderedFeatures() { return [] }
    getContainer() { return document.createElement('div') }
    remove() {}
    resize() {}
  }

  function MapCtor() {
    return new MockEvented()
  }

  return {
    default: { Map: MapCtor as unknown, LngLatBounds: MockLngLatBounds as unknown },
    Map: MapCtor as unknown,
    LngLatBounds: MockLngLatBounds as unknown,
  }
})

vi.mock('@/store/graph-store', () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      graph: { components: mockGraphComponents, buildings: [{ campusId: 'test' }] },
      removeComponent: mockRemoveComponent,
      updateComponent: mockUpdateComponent,
      save: mockSaveGraph,
    }),
}))

const building: Building = {
  id: 'BLD01',
  name: 'Test Building',
  campusId: 'asu-ibajay',
  floors: [0],
  footprint: [{ lat: 11.8195, lng: 122.0922 }],
}

const layers: LayerVisibility = {
  osm: false, satellite: false, floor_plan: true, buildings: false,
  rooms: true, hallways: true, assets: true, nodes: false, edges: false, labels: true,
}

describe('FloorEditorCanvas', () => {
  beforeEach(() => {
    mockGraphComponents = []
    mockRemoveComponent = vi.fn()
    mockUpdateComponent = vi.fn()
    mockSaveGraph = vi.fn()
  })

  afterEach(cleanup)

  it('renders without crashing', () => {
    expect(() =>
      render(
        <FloorEditorCanvas
          building={building}
          floor={0}
          tool="select"
          layers={layers}
          selectedId={null}
          onSelect={vi.fn()}
        />
      )
    ).not.toThrow()
  })

  it('does not show delete button when no component selected', () => {
    render(
      <FloorEditorCanvas
        building={building}
        floor={0}
        tool="select"
        layers={layers}
        selectedId={null}
        onSelect={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('shows delete button when a component is selected', () => {
    render(
      <FloorEditorCanvas
        building={building}
        floor={0}
        tool="select"
        layers={layers}
        selectedId="C001"
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('calls removeComponent and saveGraph on delete click', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <FloorEditorCanvas
        building={building}
        floor={0}
        tool="select"
        layers={layers}
        selectedId="C001"
        onSelect={onSelect}
      />
    )
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(mockRemoveComponent).toHaveBeenCalledWith('C001')
    expect(mockSaveGraph).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('calls onSelect(null) on delete click', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <FloorEditorCanvas
        building={building}
        floor={0}
        tool="select"
        layers={layers}
        selectedId="C001"
        onSelect={onSelect}
      />
    )
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
