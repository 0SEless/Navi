import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloorEditorCanvas } from '../FloorEditorCanvas'
import type { Building } from '@/types/nav-types'
import type { LayerVisibility } from '@/types/studio-types'

let mockDispatcherExecute = vi.fn()
let mockGraphComponents: unknown[] = []
let mockRemoveComponent = vi.fn()
let mockUpdateComponent = vi.fn()
let mockSaveGraph = vi.fn()
let mockMoveLayer = vi.fn()

interface MockMapLike {
  getSource: (id: string) => { setData: ReturnType<typeof vi.fn> } | null
}
interface MockEditorValue {
  document: unknown
  services: { get: () => { execute: ReturnType<typeof vi.fn> } | null }
  transformer: {
    buildingLocalToWorld: (point: { x: number; y: number }) => { lat: number; lng: number }
    worldToBuildingLocal: () => null
  }
}
let mockMapInstance: MockMapLike | null = null
function makeEditorValue(document: unknown): MockEditorValue {
  return {
    document,
    services: { get: () => (mockDispatcherExecute ? { execute: mockDispatcherExecute } : null) },
    transformer: { buildingLocalToWorld: () => ({ lat: 0, lng: 0 }), worldToBuildingLocal: () => null },
  }
}
let mockEditorValue: MockEditorValue = makeEditorValue({ buildings: [] })

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
    getPitch = () => 0
    getBearing = () => 0
    easeTo = () => {}
    setCenter = () => {}
    setZoom = () => {}

    constructor() {
      this._canvas = document.createElement('canvas')
    }

    on(event: string, layer?: unknown, handler?: (...args: unknown[]) => void) {
      const fn = (typeof layer === 'function' ? layer : handler!) as (...args: unknown[]) => void
      if (!this._handlers[event]) this._handlers[event] = []
      this._handlers[event].push(fn)
    }

    off(event: string, layer?: unknown, handler?: (...args: unknown[]) => void) {
      const fn = (typeof layer === 'function' ? layer : handler!) as (...args: unknown[]) => void
      if (!this._handlers[event]) return
      this._handlers[event] = this._handlers[event].filter((h) => h !== fn)
    }

    fire(event: string, ...args: unknown[]) {
      for (const h of this._handlers[event] ?? []) h(...args)
    }

    getSource(id: string) { return this._sources[id] ?? null }
    addSource(id: string, options?: Record<string, unknown>) {
      this._sources[id] = { setData: vi.fn(), updateImage: vi.fn(), type: options?.type ?? 'geojson' }
    }
    addLayer(layer: Record<string, unknown>) { this._layers[layer.id as string] = layer }
    moveLayer(layerId: string) { mockMoveLayer(layerId) }
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
    const m = new MockEvented()
    mockMapInstance = m as unknown as MockMapLike
    setTimeout(() => m.fire('load'), 0)
    return m
  }

  return {
    default: { Map: MapCtor as unknown, LngLatBounds: MockLngLatBounds as unknown },
    Map: MapCtor as unknown,
    LngLatBounds: MockLngLatBounds as unknown,
  }
})

vi.mock('@/hooks/floor-graph-selectors', () => ({
  useFloorComponents: () => mockGraphComponents as any[],
  useFloorComponent: (id: string | null) => mockGraphComponents.find((component: any) => component.id === id)
    ?? (id === 'C001' ? { id: 'C001', type: 'room', name: 'Room 1', buildingId: 'BLD01', floor: 0 } : null),
  isSemanticRoomComponent: (component: any) => component?.metadata?.source === 'derived-face' && component?.metadata?.semanticRoom === true,
  useFloorRenderVersion: () => 0,
  useFloorCampusId: () => 'asu-ibajay',
  useFloorComponentsAll: () => [],
  useFloorSyncStatus: () => 'synced',
  useFloorSyncError: () => null,
  useLegacyBuilding: () => null,
  useGraphBuilding: () => null,
  useFloorPlanUrls: () => undefined,
  countFloorComponents: () => 0,
  findGraphBuilding: () => null,
}))

vi.mock('@navi/editor', () => ({
  ENABLE_CANVAS_EDITOR: false,
  useEditor: () => mockEditorValue,
  findBuilding: () => null,
  useEditingEngine: () => ({
    snapshot: { operation: null, preview: null, state: 'idle', isDirty: false, geometryDirty: false, metadataDirty: false, compilerDirty: false, assetDirty: false },
    session: { subscribe: () => () => {}, get version() { return 0 } },
    begin: vi.fn(),
    doCommit: vi.fn().mockReturnValue({ committed: true, operation: { kind: 'delete', entityIds: ['test'] }, validationResult: { passed: true, issues: [] } }),
    execute: vi.fn(),
    cancel: vi.fn(),
    clickEmptySpace: vi.fn(),
    escape: vi.fn(),
    reset: vi.fn(),
    preview: vi.fn(),
    validate: vi.fn().mockReturnValue({ passed: true, issues: [] }),
  }),
}))

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
  baseElevation: 0,
  height: 10,
}

const layers: LayerVisibility = {
  osm: false, satellite: false, floor_plan: true, buildings: false,
  rooms: true, hallways: true, assets: true, nodes: false, edges: false, labels: true, walls3d: true,
}

describe('FloorEditorCanvas', () => {
  beforeEach(() => {
    mockDispatcherExecute = vi.fn()
    mockMoveLayer = vi.fn()
    mockMapInstance = null
    mockGraphComponents = []
    mockEditorValue = makeEditorValue({ buildings: [] })
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

  it('promotes wall editing layers above room overlays for reliable endpoint dragging', async () => {
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

    await waitFor(() => expect(mockMoveLayer).toHaveBeenCalledWith('floor-walls-line'))
    expect(mockMoveLayer.mock.calls.map(([layerId]) => layerId)).toEqual([
      'floor-selection-fill',
      'floor-selection-outline',
      'floor-selection-circle',
      'floor-walls-line',
      'floor-wall-edit-preview-line',
      'floor-wall-junctions-layer',
    ])
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

  it('dispatches room.delete command on delete click', async () => {
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
    expect(mockDispatcherExecute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'room.delete', payload: { roomId: 'C001' } })
    )
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

  it('populates red wall geometry after map readiness when the floor already has authored walls (reload case)', async () => {
    mockEditorValue = makeEditorValue({
      schemaVersion: 1,
      version: 1,
      metadata: { campusId: 'test', name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
      buildings: [
        {
          id: 'BLD01', name: 'Test Building', code: 'TB', category: 'academic', description: '',
          footprint: { points: [] }, baseElevation: 0, height: 10, color: '#fff', aliases: [], metadata: {},
          floors: [
            {
              id: 'flr-bld01-0', level: 0, label: 'Ground', elevation: 0, height: 3.5,
              walls: [
                { id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.15, height: 3.5 },
              ],
              rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
            },
          ],
          verticalConnectors: [],
        },
      ],
      roads: [], panoramas: [], qrCheckpoints: [],
    })

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

    await waitFor(() => {
      const wallSource = mockMapInstance?.getSource('floor-walls')
      expect(wallSource?.setData).toHaveBeenCalled()
    })
  })

  it('populates authored walls and derived enclosure after map readiness when the floor already contains a closed wall shell', async () => {
    const shellWalls = [
      { id: 'shell-w1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.15, height: 3.5 },
      { id: 'shell-w2', start: { x: 10, y: 0 }, end: { x: 10, y: 10 }, thickness: 0.15, height: 3.5 },
      { id: 'shell-w3', start: { x: 10, y: 10 }, end: { x: 0, y: 10 }, thickness: 0.15, height: 3.5 },
      { id: 'shell-w4', start: { x: 0, y: 10 }, end: { x: 0, y: 0 }, thickness: 0.15, height: 3.5 },
    ]
    const shellDocument = {
      schemaVersion: 1,
      version: 1,
      metadata: { campusId: 'test', name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
      buildings: [
        {
          id: 'BLD01', name: 'Test Building', code: 'TB', category: 'academic', description: '',
          footprint: { points: [] }, baseElevation: 0, height: 10, color: '#fff', aliases: [], metadata: {},
          floors: [
            {
              id: 'flr-bld01-0', level: 0, label: 'Ground', elevation: 0, height: 3.5,
              walls: shellWalls,
              rooms: [], roomAttributes: [],
              hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
            },
          ],
          verticalConnectors: [],
        },
      ],
      roads: [], panoramas: [], qrCheckpoints: [],
    }
    const documentBefore = JSON.stringify(shellDocument)
    mockEditorValue = makeEditorValue(shellDocument)
    mockEditorValue.transformer = {
      buildingLocalToWorld: (point: { x: number; y: number }) => ({ lat: point.y * 1e-5, lng: point.x * 1e-5 }),
      worldToBuildingLocal: () => null,
    }

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

    // At mount the mocked map is not ready yet: no populated sources may exist.
    expect(mockMapInstance?.getSource('floor-walls')).toBeNull()
    expect(mockMapInstance?.getSource('floor-derived-rooms')).toBeNull()

    await waitFor(() => {
      expect(mockMapInstance?.getSource('floor-walls')?.setData).toHaveBeenCalled()
      expect(mockMapInstance?.getSource('floor-derived-rooms')?.setData).toHaveBeenCalled()
    })

    const wallSource = mockMapInstance?.getSource('floor-walls')
    const wallCalls = wallSource?.setData.mock.calls ?? []
    const wallData = wallCalls[wallCalls.length - 1][0] as { features: Array<{ properties: { id: string } }> }
    expect(wallData.features).toHaveLength(4)
    expect(wallData.features.map((f) => f.properties.id).sort()).toEqual(['shell-w1', 'shell-w2', 'shell-w3', 'shell-w4'])

    const derivedSource = mockMapInstance?.getSource('floor-derived-rooms')
    const derivedCalls = derivedSource?.setData.mock.calls ?? []
    const derivedData = derivedCalls[derivedCalls.length - 1][0] as {
      features: Array<{ geometry: { type: string; coordinates: Array<Array<[number, number]>> } }>
    }
    expect(derivedData.features).toHaveLength(1)
    expect(derivedData.features[0].geometry.type).toBe('Polygon')
    const ring = derivedData.features[0].geometry.coordinates[0]
    expect(ring.length).toBeGreaterThanOrEqual(4)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    let area = 0
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    }
    expect(Math.abs(area / 2)).toBeGreaterThan(0)

    // No document mutation, no Room designation, no explicit sync calls were required.
    expect(JSON.stringify(shellDocument)).toBe(documentBefore)
    expect(shellDocument.buildings[0].floors[0].rooms).toHaveLength(0)
    expect(shellDocument.buildings[0].floors[0].roomAttributes).toHaveLength(0)
  })

  it('populates a spatial Door footprint after map readiness for 2D and 2.5D rendering', async () => {
    mockGraphComponents = [{
      id: 'door-1', type: 'door', name: 'Door', buildingId: 'BLD01', floor: 0,
      position: { lat: 0, lng: 0 },
      polygon: [
        { lat: 0, lng: 0 }, { lat: 0, lng: 0.00001 },
        { lat: 0.000002, lng: 0.00001 }, { lat: 0.000002, lng: 0 },
      ],
      metadata: { ownershipStatus: 'unassigned' },
    }]

    render(
      <FloorEditorCanvas building={building} floor={0} tool="select" layers={layers} selectedId={null} onSelect={vi.fn()} />
    )

    await waitFor(() => expect(mockMapInstance?.getSource('floor-door-areas')?.setData).toHaveBeenCalled())
    const calls = mockMapInstance?.getSource('floor-door-areas')?.setData.mock.calls ?? []
    const data = calls[calls.length - 1][0] as { features: Array<{ properties: Record<string, unknown> }> }
    expect(data.features).toHaveLength(1)
    expect(data.features[0].properties).toMatchObject({ id: 'door-1', type: 'door', height: 2.1 })
  })

  it('marks the selected route-source Entrance as active in its always-visible point source', async () => {
    mockGraphComponents = [{ id: 'entrance-1', type: 'entrance', name: 'Main Entrance', buildingId: 'BLD01', floor: 0, position: { lat: 1, lng: 2 } }]
    render(
      <FloorEditorCanvas
        building={building} floor={0} tool="hallway" layers={layers} selectedId="entrance-1" onSelect={vi.fn()}
        viewMode="2.5d" pendingRouteAnchor={{ entranceId: 'entrance-1', outdoorNodeId: 'outside-1', position: { lat: 1, lng: 2 } }}
      />
    )

    await waitFor(() => expect(mockMapInstance?.getSource('floor-point-items')?.setData).toHaveBeenCalled())
    const calls = mockMapInstance?.getSource('floor-point-items')?.setData.mock.calls ?? []
    const data = calls[calls.length - 1][0] as { features: Array<{ properties: Record<string, unknown> }> }
    expect(data.features[0].properties).toMatchObject({ id: 'entrance-1', selected: true, activeRouteSource: true })
  })
})
