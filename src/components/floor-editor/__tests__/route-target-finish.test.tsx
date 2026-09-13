import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFloorDrawing } from '../useFloorDrawing'

const mockExecute = vi.fn()
let mockDocument: any
let mockTransformer: any

vi.mock('@navi/editor', () => ({
  useEditor: () => ({
    document: mockDocument,
    transformer: mockTransformer,
    services: { get: () => ({ execute: mockExecute }) },
  }),
  findBuilding: (doc: any, buildingId: string) => doc.buildings.find((b: any) => b.id === buildingId) ?? null,
  genId: () => 'generated-id',
  snapPoint: (position: { x: number; y: number }) => ({ position }),
}))

const DEG = 111320
const ORIGIN = { lat: 11.8195, lng: 122.0922 }
mockTransformer = {
  worldToBuildingLocal: (p: { lat: number; lng: number }) => ({
    x: (p.lng - ORIGIN.lng) * DEG * Math.cos((ORIGIN.lat * Math.PI) / 180),
    y: (p.lat - ORIGIN.lat) * DEG,
  }),
  buildingLocalToWorld: (p: { x: number; y: number }) => ({
    lat: ORIGIN.lat + p.y / DEG,
    lng: ORIGIN.lng + p.x / (DEG * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  }),
}

function makeDoc() {
  return {
    buildings: [{
      id: 'BLD01',
      floors: [{
        id: 'flr-0',
        level: 0,
        routeNetwork: {
          nodes: [
            { id: 'n1', type: 'waypoint', position: { x: 0, y: 0 }, floor: 0 },
            { id: 'n2', type: 'waypoint', position: { x: 10, y: 0 }, floor: 0 },
          ],
          edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'walk', distance: 10 }],
        },
        entrances: [],
      }],
    }],
  }
}

function createProbe() {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const hits: unknown[] = []
  const map = {
    isStyleLoaded: vi.fn(() => true),
    getSource: vi.fn(() => null),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn((id: string) => ({ id })),
    queryRenderedFeatures: vi.fn(() => hits),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler) }),
    off: vi.fn(),
    once: vi.fn(),
    dragPan: { disable: vi.fn(), enable: vi.fn() },
  } as unknown as import('maplibre-gl').Map
  return {
    map,
    setHits(next: unknown[]) { hits.length = 0; hits.push(...next) },
    click(lat: number, lng: number) {
      handlers.get('click')?.({ lngLat: { lat, lng }, point: { x: 0, y: 0 }, originalEvent: { detail: 1 } })
    },
  }
}

function renderRouteTool(probe: ReturnType<typeof createProbe>) {
  return renderHook(() => useFloorDrawing({
    map: probe.map, buildingId: 'BLD01', campusId: 'C1', floor: 0, tool: 'hallway', mapReady: true,
  }))
}

beforeEach(() => {
  mockDocument = makeDoc()
  mockExecute.mockReset()
  mockExecute.mockReturnValue({ success: true, entityId: 'route-node-new' })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Route target finish', () => {
  it('opens the confirmation prompt when a click lands on a route segment', async () => {
    const probe = createProbe()
    const view = renderRouteTool(probe)

    act(() => { probe.click(11.8190, 122.0915) }) // free first point
    await waitFor(() => expect(mockExecute).not.toHaveBeenCalled())

    probe.setHits([{ layer: { id: 'floor-route-edges-line' }, properties: { id: 'e1' } }])
    act(() => { probe.click(11.8195, 122.0922) }) // click on the segment

    await waitFor(() => expect(view.result.current.routeConnectionPrompt?.edgeId).toBe('e1'))
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('Yes commits the path through a junction descriptor', async () => {
    const probe = createProbe()
    const view = renderRouteTool(probe)

    act(() => { probe.click(11.8190, 122.0915) })
    probe.setHits([{ layer: { id: 'floor-route-edges-line' }, properties: { id: 'e1' } }])
    act(() => { probe.click(11.8195, 122.0922) })
    await waitFor(() => expect(view.result.current.routeConnectionPrompt).not.toBeNull())

    act(() => { view.result.current.acceptRouteConnection() })

    await waitFor(() => expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'route.path.create' })))
    const payload = mockExecute.mock.calls.at(-1)![0].payload as { points: Array<Record<string, unknown>> }
    expect(payload.points.at(-1)!.junction).toMatchObject({ edgeId: 'e1' })
    expect(view.result.current.routeConnectionPrompt).toBeNull()
  })

  it('No commits the path at the clicked point without any junction', async () => {
    const probe = createProbe()
    const view = renderRouteTool(probe)

    act(() => { probe.click(11.8190, 122.0915) })
    probe.setHits([{ layer: { id: 'floor-route-edges-line' }, properties: { id: 'e1' } }])
    act(() => { probe.click(11.8195, 122.0922) })
    await waitFor(() => expect(view.result.current.routeConnectionPrompt).not.toBeNull())

    act(() => { view.result.current.declineRouteConnection() })

    await waitFor(() => expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'route.path.create' })))
    const payload = mockExecute.mock.calls.at(-1)![0].payload as { points: Array<Record<string, unknown>> }
    expect(payload.points.at(-1)!.junction).toBeUndefined()
    expect(payload.points.at(-1)!.existingNodeId).toBeUndefined()
  })

  it('clicking a route node finishes the path bound to that exact node', async () => {
    const probe = createProbe()
    renderRouteTool(probe)

    act(() => { probe.click(11.8190, 122.0915) })
    probe.setHits([{
      layer: { id: 'floor-route-nodes-circle' },
      properties: { id: 'n2' },
      geometry: { type: 'Point', coordinates: [ORIGIN.lng + 10 / (DEG * Math.cos((ORIGIN.lat * Math.PI) / 180)), ORIGIN.lat] },
    }])
    act(() => { probe.click(11.8195, 122.0923) })

    await waitFor(() => expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'route.path.create' })))
    const payload = mockExecute.mock.calls.at(-1)![0].payload as { points: Array<Record<string, unknown>> }
    expect(payload.points.at(-1)).toMatchObject({ existingNodeId: 'n2' })
  })
})
