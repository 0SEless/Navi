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
    expect(selectFloorArchitecture([record], { active: true, buildingId: 'b' }, 2, true)).toBe(record)
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
    expect(map.layers.size).toBe(7)
    expect(map.layers.get('floor-architecture-glass')!.paint['fill-extrusion-opacity']).toBe(0.3)
    expect(map.layers.get('floor-architecture-panels')!.paint['fill-extrusion-opacity']).toBe(1)
    map.layers.clear(); map.sources.clear()
    act(() => map.fire('style.load'))
    expect(map.layers.size).toBe(7)
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
