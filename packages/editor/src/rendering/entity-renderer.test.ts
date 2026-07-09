import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EntityRenderer } from './entity-renderer'
import { DocumentEventBus } from '../eventbus'
import { documentToGeoJSON } from './geojson'

vi.mock('./geojson', () => ({
  documentToGeoJSON: vi.fn().mockReturnValue({
    buildings: { type: 'FeatureCollection', features: [] },
    rooms: { type: 'FeatureCollection', features: [] },
    hallways: { type: 'FeatureCollection', features: [] },
    roads: { type: 'FeatureCollection', features: [] },
    entrances: { type: 'FeatureCollection', features: [] },
    staircases: { type: 'FeatureCollection', features: [] },
    elevators: { type: 'FeatureCollection', features: [] },
    panoramas: { type: 'FeatureCollection', features: [] },
    qr: { type: 'FeatureCollection', features: [] },
  }),
  toPreviewFeature: vi.fn((geom: any) => ({ type: 'Feature', geometry: geom })),
}))

function createMockMap() {
  const sourceData = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  return {
    on: vi.fn(),
    off: vi.fn(),
    loaded: vi.fn().mockReturnValue(true),
    getSource: vi.fn((id: string) => sourceData.get(id)),
    addSource: vi.fn((id: string, _: any) => {
      sourceData.set(id, { setData: vi.fn() })
    }),
    removeSource: vi.fn((id: string) => sourceData.delete(id)),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(undefined),
  }
}

function createOptions(map: ReturnType<typeof createMockMap>) {
  const eventBus = new DocumentEventBus()
  return {
    map: map as any,
    document: { metadata: { name: 'test' } } as any,
    eventBus,
    selection: { on: vi.fn() } as any,
    viewport: { on: vi.fn() } as any,
  }
}

describe('EntityRenderer', () => {
  let map: ReturnType<typeof createMockMap>
  let renderer: EntityRenderer
  let options: ReturnType<typeof createOptions>

  beforeEach(() => {
    vi.clearAllMocks()
    map = createMockMap()
    options = createOptions(map)
    renderer = new EntityRenderer(options)
  })

  it('stores options on construction', () => {
    expect(renderer).toBeInstanceOf(EntityRenderer)
  })

  it('init() adds sources and layers when map is loaded', () => {
    renderer.init()
    expect(map.addSource).toHaveBeenCalled()
    expect(map.addLayer).toHaveBeenCalled()
  })

  it('init() registers load listener when map is not loaded', () => {
    map.loaded.mockReturnValue(false)
    renderer.init()
    expect(map.on).toHaveBeenCalledWith('load', expect.any(Function))
  })

  it('init() does not run twice', () => {
    renderer.init()
    map.addSource.mockClear()
    renderer.init()
    expect(map.addSource).not.toHaveBeenCalled()
  })

  it('syncAll() updates sources from document', () => {
    renderer.init()
    expect(documentToGeoJSON).toHaveBeenCalled()
  })

  it('destroy() removes all layers and sources', () => {
    renderer.init()
    map.removeLayer.mockClear()
    map.removeSource.mockClear()
    renderer.destroy()
    expect(map.removeLayer).toHaveBeenCalled()
    expect(map.removeSource).toHaveBeenCalled()
  })

  it('setPreview() updates preview source', () => {
    renderer.init()
    const geo = { type: 'Point' as const, coordinates: [0, 0] }
    renderer.setPreview(geo)
    const previewSource = map.getSource('navi-preview')
    expect(previewSource?.setData).toHaveBeenCalled()
  })

  it('clearPreview() updates preview source with empty collection', () => {
    renderer.init()
    renderer.clearPreview()
    const previewSource = map.getSource('navi-preview')
    expect(previewSource?.setData).toHaveBeenCalledWith({
      type: 'FeatureCollection',
      features: [],
    })
  })

  it('updateSelection() updates selection source', () => {
    renderer.init()
    renderer.updateSelection([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])
    const selSource = map.getSource('navi-selection')
    expect(selSource?.setData).toHaveBeenCalled()
  })

  it('entity.created event triggers syncAll', () => {
    const spy = vi.spyOn(renderer, 'syncAll' as any)
    renderer.init()
    spy.mockClear()
    options.eventBus.emit('entity.created', { entityId: 'bld-1', entityType: 'building' })
    expect(spy).toHaveBeenCalled()
  })
})
