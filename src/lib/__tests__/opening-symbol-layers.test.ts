import { describe, expect, it } from 'vitest'
import { buildFloorArchitectureAssets } from '../floor-architecture-assets'
import { OPENING_SYMBOL_LAYER_IDS, syncOpeningSymbolLayers } from '../opening-symbol-layers'

const wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, height: 3, thickness: 0.2 }
const transformer = { buildingLocalToWorld: ({ x, y }: { x: number; y: number }) => ({ lng: 100 + x, lat: 10 + y }) }
function mapMock() {
  const sources = new Map<string, { data: unknown; setData(d: unknown): void }>()
  const layers = new Map<string, any>()
  const props: Record<string, unknown> = {}
  return { sources, layers, props,
    getSource: (id: string) => sources.get(id), getLayer: (id: string) => layers.get(id),
    addSource(id: string, v: { data: unknown }) { sources.set(id, { data: v.data, setData(d) { this.data = d } }) },
    addLayer(v: any) { layers.set(v.id, v) },
    setLayoutProperty(id: string, key: string, value: unknown) { props[`${id}.${key}`] = value },
  }
}

describe('opening plan symbols in apps', () => {
  it('buildFloorArchitectureAssets returns symbols in world coordinates', () => {
    const assets = buildFloorArchitectureAssets({ walls: [wall] as never, openings: [], doors: [{ id: 'd', width: 1, doorType: 'fire', wallAttachment: { wallId: 'w', offset: 3, openingHeight: 2.1 } }] as never, stairs: [], transformer, buildingId: 'b' })
    const leaf = assets.symbols.lines.features.find(f => f.properties?.kind === 'leaf')!
    expect(leaf.geometry.coordinates[0]).toEqual([102.5, 10])
    expect(assets.symbols.markers.features[0].geometry.coordinates).toEqual([103, 10])
  })

  it('adds a line layer and a fire label layer from zoom 18, then updates data in place', () => {
    const map = mapMock()
    const symbols = { lines: { type: 'FeatureCollection', features: [] }, markers: { type: 'FeatureCollection', features: [] } } as never
    syncOpeningSymbolLayers(map as never, symbols, true)
    expect(OPENING_SYMBOL_LAYER_IDS).toEqual(['floor-opening-symbols-lines', 'floor-opening-symbols-fire'])
    for (const id of OPENING_SYMBOL_LAYER_IDS) expect(map.layers.get(id).minzoom).toBe(18)
    expect(map.layers.get('floor-opening-symbols-fire').layout['text-field']).toBe('F')
    const next = { lines: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { kind: 'arc' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] }, markers: { type: 'FeatureCollection', features: [] } } as never
    syncOpeningSymbolLayers(map as never, next, false)
    expect(map.layers.size).toBe(2)
    expect((map.sources.get('floor-opening-symbols-lines')!.data as any).features).toHaveLength(1)
    expect(map.props['floor-opening-symbols-lines.visibility']).toBe('none')
  })
})

describe('extrusion colours (Task 9)', () => {
  it('extrusion layers use [\'get\',\'color\'] with today\'s colour as fallback', async () => {
    const { doorExtrusionColor } = await import('../opening-symbol-layers')
    expect(doorExtrusionColor('#a88463')).toEqual(['coalesce', ['get', 'color'], '#a88463'])
  })
})

describe('shutter line style (Task 10)', () => {
  it('dashes the roll-up shutter line like the swing arc', () => {
    const map = mapMock()
    syncOpeningSymbolLayers(map as never, { lines: { type: 'FeatureCollection', features: [] }, markers: { type: 'FeatureCollection', features: [] } } as never, true)
    expect(JSON.stringify(map.layers.get('floor-opening-symbols-lines').paint['line-dasharray'])).toContain('"shutter"')
  })
})

describe('window swing line style (Task 15)', () => {
  it('dashes the casement/awning swing indicator', () => {
    const map = mapMock()
    syncOpeningSymbolLayers(map as never, { lines: { type: 'FeatureCollection', features: [] }, markers: { type: 'FeatureCollection', features: [] } } as never, true)
    expect(JSON.stringify(map.layers.get('floor-opening-symbols-lines').paint['line-dasharray'])).toContain('"window-swing"')
  })
})

describe('final review fix: paint keys match emitted kinds', () => {
  it('styles fold as a thick line and window-hatch / window-swing in window blue', () => {
    const map = mapMock()
    syncOpeningSymbolLayers(map as never, { lines: { type: 'FeatureCollection', features: [] }, markers: { type: 'FeatureCollection', features: [] } } as never, true)
    const paint = map.layers.get('floor-opening-symbols-lines').paint
    expect(JSON.stringify(paint['line-width'])).toContain('"fold"')
    for (const kind of ['window-hatch', 'window-swing']) expect(JSON.stringify(paint['line-color'])).toContain(`"${kind}"`)
    expect(JSON.stringify(paint)).not.toMatch(/"zigzag"|"hatch"/)
  })
})
