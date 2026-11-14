import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { BuildingLayer } from '../BuildingLayer'

afterEach(cleanup)

/** A map whose style is still loading when the layer mounts, after its one 'load' already fired. */
function loadingMap() {
  const handlers = new Map<string, Array<() => void>>()
  const layers: string[] = []
  const sources = new Set<string>()
  const state = { loaded: false }
  return {
    layers, state,
    on(type: string, fn: () => void) { handlers.set(type, [...(handlers.get(type) ?? []), fn]) },
    off(type: string, fn: () => void) { handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)) },
    fire(type: string) { for (const fn of [...(handlers.get(type) ?? [])]) fn() },
    isStyleLoaded: () => state.loaded,
    getSource: (id: string) => (sources.has(id) ? { setData: () => {} } : undefined),
    addSource: (id: string) => { sources.add(id) },
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => { layers.push(layer.id) },
    removeLayer: (id: string) => { layers.splice(layers.indexOf(id), 1) },
    removeSource: (id: string) => { sources.delete(id) },
    setFeatureState: () => {},
    triggerRepaint: () => {},
    getCanvas: () => ({ style: { cursor: '' } }),
  }
}

describe('map layers set up even when the style is still loading (Task 15)', () => {
  it('BuildingLayer sets up when a source delivers data, if it mounted while sources were loading', () => {
    const map = loadingMap()
    render(<BuildingLayer map={map as never} buildings={[]} />)
    expect(map.layers).not.toContain('buildings-fill')
    map.state.loaded = true
    act(() => map.fire('sourcedata'))
    expect(map.layers).toContain('buildings-fill')
  })
})

/** Same as loadingMap, but records every setData so we can see whether data ever reaches the source. */
function recordingMap() {
  const map = loadingMap() as ReturnType<typeof loadingMap> & { data: Map<string, { features: unknown[] }> }
  const sources = new Map<string, { setData: (d: { features: unknown[] }) => void }>()
  map.data = new Map()
  map.getSource = (id: string) => sources.get(id) as never
  map.addSource = (id: string, spec?: { data?: { features: unknown[] } }) => { sources.set(id, { setData: (d) => { map.data.set(id, d) } }); if (spec?.data) map.data.set(id, spec.data) }
  return map
}
const square = (lat: number, lng: number) => [{ lat, lng }, { lat, lng: lng + 0.001 }, { lat: lat + 0.001, lng: lng + 0.001 }, { lat: lat + 0.001, lng }]

describe('late-initialised layers receive their data (terrain campuses)', () => {
  it('BuildingLayer pushes its buildings once it sets up after a sourcedata event', async () => {
    const map = recordingMap()
    render(<BuildingLayer map={map as never} buildings={[{ id: 'b', name: 'B', footprint: square(11, 122), color: '#888', height: 9, floors: 3, entrances: [], nodeIds: [] }] as never} />)
    map.state.loaded = true
    act(() => map.fire('sourcedata'))
    expect(map.data.get('buildings')?.features).toHaveLength(1)
  })

  it('RoomLayer pushes its rooms once it sets up after a sourcedata event', async () => {
    const { RoomLayer } = await import('../RoomLayer')
    const map = recordingMap()
    render(<RoomLayer map={map as never} rooms={[{ id: 'r', name: 'R', buildingId: 'b', floor: 0, polygon: square(11, 122), center: { lat: 11.0005, lng: 122.0005 } }]} indoorContext={{ active: true, buildingId: 'b', floorId: 0 }} />)
    map.state.loaded = true
    act(() => map.fire('sourcedata'))
    expect(map.data.get('rooms')?.features).toHaveLength(1)
  })
})

describe('late-initialised entrance and boundary layers receive their data', () => {
  it('EntranceLayer pushes entrances after a late setup', async () => {
    const { EntranceLayer } = await import('../EntranceLayer')
    const map = recordingMap()
    render(<EntranceLayer map={map as never} entrances={[{ id: 'e', label: 'E', position: { lat: 11, lng: 122 }, buildingId: 'b', floor: 0 }] as never} />)
    map.state.loaded = true
    act(() => map.fire('sourcedata'))
    expect([...map.data.values()].some(d => d.features.length === 1)).toBe(true)
  })
})
