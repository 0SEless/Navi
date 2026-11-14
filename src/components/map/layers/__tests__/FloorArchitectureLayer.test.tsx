import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { FloorArchitectureLayer, selectFloorArchitecture, floorArchitectureFallback } from '../FloorArchitectureLayer'
import type { FloorArchitectureRenderData } from '../../NavigationRenderModel'
afterEach(cleanup)
const empty = { type: 'FeatureCollection', features: [] } as const
const record = { buildingId: 'b', floor: 2, walls: empty, frames: empty, panels: empty, stairs: empty, glass: empty, diagnostics: [], modeledIds: { walls: [], doors: [], openings: [], stairs: [] } } as unknown as FloorArchitectureRenderData
function mapFixture() {
  const handlers = new Map<string, Set<() => void>>()
  const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>()
  const layers = new Map<string, { paint: Record<string, unknown> }>()
  const map = { style: { _loaded: false }, sources, layers, handlers,
    isStyleLoaded: () => false,
    on(event: string, cb: () => void) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(cb) },
    off(event: string, cb: () => void) { handlers.get(event)?.delete(cb) },
    fire(event: string) { handlers.get(event)?.forEach(cb => cb()) },
    getSource: (id: string) => sources.get(id), getLayer: (id: string) => layers.get(id),
    addSource(id: string, value: { data: unknown }) { sources.set(id, { data: value.data, setData(data) { this.data = data } }) },
    addLayer(value: { id: string; paint: Record<string, unknown> }) { layers.set(value.id, value) },
    removeLayer: (id: string) => layers.delete(id), removeSource: (id: string) => sources.delete(id),
    setLayoutProperty: () => {},
  }
  return map
}
describe('canonical public architecture layer', () => {
  it('requires pitched view, indoor building selection and the exact floor', () => {
    expect(selectFloorArchitecture([record], { active: true, buildingId: 'b' }, 2, true)).toMatchObject({ buildingId: 'b', floor: 2 })
    for (const [context, floor, pitch] of [[{ active: false, buildingId: 'b' }, 2, true], [{ active: true }, 2, true], [{ active: true, buildingId: 'other' }, 2, true], [{ active: true, buildingId: 'b' }, 1, true], [{ active: true, buildingId: 'b' }, 2, false]] as const) expect(selectFloorArchitecture([record], context, floor, pitch)).toBeUndefined()
  })
  it('suppresses only actual assets and retains missing geometry and other floors', () => {
    const records = [{ id: 'modeled', buildingId: 'b', floor: 2 }, { id: 'missing', buildingId: 'b', floor: 2 }, { id: 'modeled', buildingId: 'other', floor: 2 }, { id: 'modeled', buildingId: 'b', floor: 1 }]
    const architecture = { ...record, modeledIds: { ...record.modeledIds, doors: ['modeled'] } }
    expect(floorArchitectureFallback(records, architecture, 'doors')).toEqual(records.slice(1))
    expect(floorArchitectureFallback(records, undefined, 'doors')).toBe(records)
  })
  it('handles pending styles, replacement, context change, resize and cleanup', () => {
    const map = mapFixture()
    const view = render(<FloorArchitectureLayer map={map as never} architecture={record} />)
    expect(map.layers.size).toBe(0)
    map.style._loaded = true
    act(() => map.fire('style.load'))
    expect(map.layers.size).toBe(9)
    expect(map.layers.get('floor-architecture-glass')!.paint['fill-extrusion-opacity']).toBe(0.3)
    expect(map.layers.get('floor-architecture-panels')!.paint['fill-extrusion-opacity']).toBe(1)
    map.layers.clear(); map.sources.clear()
    act(() => map.fire('style.load'))
    expect(map.layers.size).toBe(9)
    act(() => map.fire('resize'))
    view.rerender(<FloorArchitectureLayer map={map as never} />)
    expect(map.sources.get('floor-architecture-walls')!.data).toEqual(empty)
    view.unmount()
    expect(map.layers.size).toBe(0); expect(map.sources.size).toBe(0)
    expect([...map.handlers.values()].every(set => set.size === 0)).toBe(true)
  })
})

describe('the building you are inside opens up', () => {
  it('hides that building\'s shell and terrain block while its floor is shown, and restores them after', () => {
    const map = mapFixture() as ReturnType<typeof mapFixture> & { filters: Record<string, unknown> }
    map.filters = {}
    ;(map as unknown as { setFilter: (id: string, f: unknown) => void }).setFilter = (id, f) => { map.filters[id] = f }
    map.layers.set('buildings-extrusion', { paint: {} }); map.layers.set('site-slabs', { paint: {} })
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const view = render(<FloorArchitectureLayer map={map as never} architecture={record} />)
    expect(map.filters['buildings-extrusion']).toEqual(['!=', ['get', 'id'], 'b'])
    expect(map.filters['site-slabs']).toEqual(['!=', ['get', 'buildingId'], 'b'])
    view.rerender(<FloorArchitectureLayer map={map as never} architecture={undefined} />)
    expect(map.filters['buildings-extrusion']).toBeNull()
    expect(map.filters['site-slabs']).toBeNull()
  })
})

describe('on a hillside', () => {
  it('levels every piece of the shown floor to the building floor, whatever the ground under it', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const wall = (lng: number) => ({ type: 'Feature', properties: { base: 0, height: 3 }, geometry: { type: 'Polygon', coordinates: [[[lng, 11], [lng + 0.0001, 11], [lng + 0.0001, 11.0001], [lng, 11.0001], [lng, 11]]] } })
    const walls = { type: 'FeatureCollection', features: [wall(120), wall(120.0004)] }
    const ground = (p: { lng: number }) => (p.lng - 120) * 10000
    render(<FloorArchitectureLayer map={map as never} architecture={{ ...record, walls } as never} level={{ ground, floorM: 2 }} />)
    const out = map.sources.get('floor-architecture-walls')!.data as GeoJSON.FeatureCollection
    expect(out.features.map((f) => f.properties!.base)).toEqual([expect.closeTo(1.5), expect.closeTo(-2.5)])
  })
})

describe('on a hillside, with the map\'s own terrain', () => {
  it('uses the ground the map lifts each piece by, and re-levels when the terrain detail changes', () => {
    const map = mapFixture() as ReturnType<typeof mapFixture> & Record<string, unknown>
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    let rise = 10000
    map.getTerrain = () => ({ source: 'dem' })
    map.queryTerrainElevation = ([lng]: [number, number]) => (lng - 120) * rise
    const wall = (lng: number) => ({ type: 'Feature', properties: { base: 0, height: 3 }, geometry: { type: 'Polygon', coordinates: [[[lng, 11], [lng + 0.0001, 11], [lng + 0.0001, 11.0001], [lng, 11.0001], [lng, 11]]] } })
    const walls = { type: 'FeatureCollection', features: [wall(120), wall(120.0004)] }
    const sampler = () => 0
    render(<FloorArchitectureLayer map={map as never} architecture={{ ...record, walls } as never} level={{ ground: sampler, floorM: 2 }} />)
    const bases = () => (map.sources.get('floor-architecture-walls')!.data as GeoJSON.FeatureCollection).features.map((f) => f.properties!.base)
    expect(bases()).toEqual([expect.closeTo(1.5), expect.closeTo(-2.5)])
    rise = 20000
    act(() => (map as unknown as { fire: (e: string) => void }).fire('idle'))
    expect(bases()).toEqual([expect.closeTo(1), expect.closeTo(-7)])
  })
})

describe('the open floor has a solid floor', () => {
  it('covers the building outline with an opaque slab at floor level, so no ground shows under the floor', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const outline = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0004 }, { lat: 11.0002, lng: 120.0004 }, { lat: 11.0002, lng: 120 }]
    const ground = (p: { lng: number }) => (p.lng - 120) * 10000
    render(<FloorArchitectureLayer map={map as never} architecture={record} floorAreas={[outline]} level={{ ground, floorM: 2 }} />)
    const slab = map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection
    expect(slab.features).toHaveLength(1)
    const ring = (slab.features[0].geometry as GeoJSON.Polygon).coordinates[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])
    // Centre ground 2 m = the floor: the slab is a 30 cm floor on top of it; its base reaches into the ground.
    expect(slab.features[0].properties!.height).toBeCloseTo(0.3)
    expect(slab.features[0].properties!.base).toBeLessThanOrEqual(0)
    const room = [{ lat: 11.0002, lng: 120 }, { lat: 11.0002, lng: 120.0004 }, { lat: 11.0003, lng: 120.0004 }, { lat: 11.0003, lng: 120 }]
    render(<FloorArchitectureLayer map={map as never} architecture={record} floorAreas={[outline, room]} level={{ ground, floorM: 2 }} />)
    // A room reaching past the outline is covered too.
    expect((map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection).features).toHaveLength(2)
    const layer = map.layers.get('floor-architecture-floor')!
    expect(layer.paint['fill-extrusion-opacity']).toBe(1)
  })

  it('draws no slab without an open floor', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    render(<FloorArchitectureLayer map={map as never} floorAreas={[[{ lat: 11, lng: 120 }, { lat: 11, lng: 121 }, { lat: 12, lng: 121 }]]} />)
    expect((map.sources.get('floor-architecture-floor')?.data as GeoJSON.FeatureCollection | undefined)?.features ?? []).toHaveLength(0)
  })
})

describe('floor slab reaches the walls', () => {
  it('covers to the walls when the walls stand past a box-shaped outline', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const sq = (lng: number, lat: number, w: number, h: number) => [[[lng, lat], [lng + w, lat], [lng + w, lat + h], [lng, lat + h], [lng, lat]]]
    const walls = { type: 'FeatureCollection', features: [sq(120, 11, 0.0004, 0.00001), sq(120, 11.00021, 0.0004, 0.00001)].map((coordinates) => ({ type: 'Feature', properties: { base: 0, height: 3 }, geometry: { type: 'Polygon', coordinates } })) }
    const outline = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0004 }, { lat: 11.0002, lng: 120.0004 }, { lat: 11.0002, lng: 120 }]
    render(<FloorArchitectureLayer map={map as never} architecture={{ ...record, walls } as never} floorAreas={[outline]} />)
    const slab = map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection
    expect(slab.features).toHaveLength(2)
    const lats = (slab.features[1].geometry as GeoJSON.Polygon).coordinates[0].map((p) => p[1])
    expect(Math.max(...lats)).toBeCloseTo(11.00022, 7)
  })

  it('does not fill an L-shaped building\'s notch', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const L = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0004 }, { lat: 11.0001, lng: 120.0004 }, { lat: 11.0001, lng: 120.0001 }, { lat: 11.0004, lng: 120.0001 }, { lat: 11.0004, lng: 120 }]
    const walls = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { base: 0, height: 3 }, geometry: { type: 'Polygon', coordinates: [[...L.map((p) => [p.lng, p.lat]), [120, 11]]] } }] }
    render(<FloorArchitectureLayer map={map as never} architecture={{ ...record, walls } as never} floorAreas={[L]} />)
    expect((map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection).features).toHaveLength(1)
  })
})

describe('floors stack', () => {
  const fc = (id: string) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id, base: 0, height: 1 }, geometry: { type: 'Polygon', coordinates: [[[120, 11], [120.0001, 11], [120.0001, 11.0001], [120, 11]]] } }] }) as GeoJSON.FeatureCollection
  const floorRec = (floor: number, elevation: number) => ({ ...record, buildingId: 'b', floor, elevation, walls: fc(`w${floor}`), symbols: fc(`s${floor}`), modeledIds: { ...record.modeledIds, doors: [`d${floor}`] } }) as unknown as FloorArchitectureRenderData
  const records = [floorRec(2, 7), floorRec(0, 0), floorRec(1, 3.5)]

  it('the chosen floor stands on every floor below it; floors above are left off', () => {
    const shown = selectFloorArchitecture(records, { active: true, buildingId: 'b' }, 1, true)!
    expect(shown.walls.features.map(f => f.properties!.id)).toEqual(['w0', 'w1'])
    expect(shown.floor).toBe(1)
    expect(shown.stackElevations).toEqual([0, 3.5])
    // Door symbols and the 2D stand-ins belong to the chosen floor only.
    expect((shown.symbols as GeoJSON.FeatureCollection).features.map(f => f.properties!.id)).toEqual(['s1'])
    expect(shown.modeledIds.doors).toEqual(['d1'])
  })

  it('each stacked floor gets its own floor slab at its height', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const shown = selectFloorArchitecture(records, { active: true, buildingId: 'b' }, 2, true)!
    const outline = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0004 }, { lat: 11.0002, lng: 120.0004 }, { lat: 11.0002, lng: 120 }]
    render(<FloorArchitectureLayer map={map as never} architecture={shown} floorAreas={[outline]} />)
    const slabs = (map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection).features.map(f => [f.properties!.base, f.properties!.height])
    expect(slabs).toEqual([[-50, 0.3], [3.5, 3.8], [7, 7.3]])
  })
})

describe('each floor slab follows that floor\'s own walls', () => {
  it('uses the spaces each stacked floor encloses, and the outline only for a floor without walls', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const face = (lng: number) => [{ lat: 11, lng }, { lat: 11, lng: lng + 0.0001 }, { lat: 11.0001, lng: lng + 0.0001 }, { lat: 11.0001, lng }]
    const rec = (floor: number, elevation: number, floorFaces: Array<Array<{ lat: number; lng: number }>>) => ({ ...record, buildingId: 'b', floor, elevation, floorFaces }) as unknown as FloorArchitectureRenderData
    const shown = selectFloorArchitecture([rec(0, 0, [face(120), face(120.0001)]), rec(1, 3.5, [])], { active: true, buildingId: 'b' }, 1, true)!
    const outline = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0004 }, { lat: 11.0002, lng: 120.0004 }, { lat: 11.0002, lng: 120 }]
    render(<FloorArchitectureLayer map={map as never} architecture={shown} floorAreas={[outline]} />)
    const slabs = (map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection).features.map(f => f.properties!.height)
    // GF: its two enclosed spaces; 1F (no walls): the outline.
    expect(slabs).toEqual([0.3, 0.3, 3.8])
  })
})

describe('the picked room is highlighted', () => {
  it('draws a blue patch over the room, on top of its floor slab', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const ring = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0001 }, { lat: 11.0001, lng: 120.0001 }, { lat: 11.0001, lng: 120 }]
    render(<FloorArchitectureLayer map={map as never} architecture={record} highlight={{ ring, elevation: 3.5 }} />)
    const patch = (map.sources.get('floor-architecture-highlight')!.data as GeoJSON.FeatureCollection).features
    expect(patch).toHaveLength(1)
    expect(patch[0].properties!.base).toBeCloseTo(3.8)
    expect(patch[0].properties!.height).toBeGreaterThan(3.8)
  })

  it('also shows in the flat view (no floor drawn)', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const ring = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0001 }, { lat: 11.0001, lng: 120.0001 }]
    render(<FloorArchitectureLayer map={map as never} highlight={{ ring, elevation: 0 }} />)
    expect((map.sources.get('floor-architecture-highlight')!.data as GeoJSON.FeatureCollection).features).toHaveLength(1)
  })
})

describe('room names stay readable', () => {
  it('lifts the room names above the 2.5D floor so the floor never covers them', () => {
    const map = mapFixture() as ReturnType<typeof mapFixture> & { moved: string[]; moveLayer: (id: string) => void }
    map.moved = []
    map.moveLayer = (id: string) => { map.moved.push(id) }
    map.layers.set('rooms-labels', { paint: {} })
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    render(<FloorArchitectureLayer map={map as never} architecture={record} />)
    expect(map.moved).toContain('rooms-labels')
  })
})

describe('the whole floor plate has a floor (hallways too)', () => {
  it('covers the full area each floor\'s walls span, not only its enclosed rooms', () => {
    const map = mapFixture()
    map.style._loaded = true; (map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => true
    const wall = (a: [number, number], b: [number, number]) => ({ type: 'Feature', properties: { base: 3.5, height: 7 }, geometry: { type: 'Polygon', coordinates: [[[a[0], a[1]], [b[0], b[1]], [b[0], b[1] + 0.000001], [a[0], a[1] + 0.000001], [a[0], a[1]]]] } })
    // 1F: a room on the left plus an open hallway on the right (walls reach x = 120.0004, not enclosed).
    const walls1 = { type: 'FeatureCollection', features: [wall([120, 11], [120.0004, 11]), wall([120, 11.0002], [120.0004, 11.0002])] } as GeoJSON.FeatureCollection
    const room = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0002 }, { lat: 11.0002, lng: 120.0002 }, { lat: 11.0002, lng: 120 }]
    const rec = (floor: number, elevation: number, walls: GeoJSON.FeatureCollection, floorFaces: unknown[]) => ({ ...record, buildingId: 'b', floor, elevation, walls, floorFaces }) as unknown as FloorArchitectureRenderData
    const shown = selectFloorArchitecture([rec(0, 0, { type: 'FeatureCollection', features: [] }, []), rec(1, 3.5, walls1, [room])], { active: true, buildingId: 'b' }, 1, true)!
    const outline = [{ lat: 11, lng: 120 }, { lat: 11, lng: 120.0004 }, { lat: 11.0002, lng: 120.0004 }, { lat: 11.0002, lng: 120 }]
    render(<FloorArchitectureLayer map={map as never} architecture={shown} floorAreas={[outline]} />)
    const upper = (map.sources.get('floor-architecture-floor')!.data as GeoJSON.FeatureCollection).features.filter(f => f.properties!.base === 3.5)
    const lngs = upper.flatMap(f => (f.geometry as GeoJSON.Polygon).coordinates[0].map(p => p[0]))
    expect(Math.max(...lngs)).toBeCloseTo(120.0004, 7)
  })
})
