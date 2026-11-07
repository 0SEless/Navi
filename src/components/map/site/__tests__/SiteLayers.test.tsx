import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { buildSiteArtifact, toLatLng, type CampusDocument, type SiteArtifact } from '@navi/core'
import { SiteLayers, SITE_LAYER } from '../SiteLayers'

const protocol = vi.hoisted(() => ({ registered: [] as string[] }))
vi.mock('@/lib/terrain/dem-protocol', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/terrain/dem-protocol')
  return { ...actual, registerTerrainProtocol: (scheme: string) => { protocol.registered.push(scheme); return () => {} } }
})

afterEach(() => {
  cleanup()
  protocol.registered = []
})

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function plane() {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, 2 + x * 0.1]
  }
  return { kind: 'mesh' as const, vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]] as Array<[number, number, number]>, sourceNote: 'test' }
}

function site(withTerrain = true): SiteArtifact {
  return buildSiteArtifact({
    schemaVersion: 1, version: 0, metadata: { campusId: 'c' }, panoramas: [], qrCheckpoints: [], buildings: [],
    roads: [{ id: 'r1', polyline: { points: [ll(-20, 5), ll(60, 5)] }, width: 6, type: 'connector' }],
    boundary: { points: [ll(-50, -50), ll(100, -50), ll(100, 50), ll(-50, 50)] },
    ...(withTerrain ? { terrain: { reference: { name: 'T', zeroMeaning: 'Sea' }, grid, base: plane(), colorRange: { minM: 0, maxM: 40 } } } : {}),
    structures: [{
      id: 's1', form: 'stairs', presetId: 'plain-stair', width: 2, underneath: 'open', railings: 'both',
      start: { kind: 'ground', position: ll(0, 0) }, end: { kind: 'ground', position: ll(20, 0) }, heightOverride: { start: 6, end: 2 },
    }],
  } as unknown as CampusDocument)!
}

function fakeMap() {
  const layers: Array<{ id: string; type: string; implementation?: { vertexCount(): number }; layout?: Record<string, unknown> }> = [{ id: 'background', type: 'background' }]
  const sources = new Map<string, Record<string, unknown>>()
  const terrain: unknown[] = []
  return {
    layers, sources, terrain,
    getStyle: () => ({ layers }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (layer: { id: string; type: string; layout?: Record<string, unknown> }, before?: string) => {
      const at = before ? layers.findIndex((l) => l.id === before) : -1
      const entry = layer.type === 'custom' ? { ...layer, implementation: layer as unknown as { vertexCount(): number } } : { ...layer }
      layers.splice(at < 0 ? layers.length : at, 0, entry)
    },
    removeLayer: (id: string) => { layers.splice(layers.findIndex((l) => l.id === id), 1) },
    getSource: (id: string) => sources.get(id) ? { setData: (d: unknown) => { sources.get(id)!.data = d }, setTiles: () => {} } : undefined,
    addSource: (id: string, spec: Record<string, unknown>) => { sources.set(id, { ...spec }) },
    removeSource: (id: string) => { sources.delete(id) },
    setLayoutProperty: (id: string, key: string, value: unknown) => { const l = layers.find((x) => x.id === id)!; l.layout = { ...l.layout, [key]: value } },
    setTerrain: (spec: unknown) => { terrain.push(spec) },
    triggerRepaint: () => {},
  }
}

const ids = (map: ReturnType<typeof fakeMap>) => map.layers.map((l) => l.id)
const visible = (map: ReturnType<typeof fakeMap>, id: string) => map.layers.find((l) => l.id === id)?.layout?.visibility !== 'none'

describe('SiteLayers (NAVI Web, campus only)', () => {
  it('with terrain: campus ground, hillshade, roads with markings, stairs; 2D has no 3D terrain and no slabs', () => {
    const map = fakeMap()
    render(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours={false} />)
    expect(protocol.registered).toEqual(['navi-site'])
    for (const id of [SITE_LAYER.ground, SITE_LAYER.hillshade, SITE_LAYER.roads, SITE_LAYER.roadEdges, SITE_LAYER.roadCentre, SITE_LAYER.structures]) expect(ids(map)).toContain(id)
    expect(ids(map)[0]).toBe('background')
    expect(map.terrain.at(-1) ?? null).toBeNull()
    expect(visible(map, SITE_LAYER.slabs)).toBe(false)
  })

  it('3D toggle enables terrain (exaggeration 1) and the slabs', () => {
    const map = fakeMap()
    const { rerender } = render(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours={false} />)
    rerender(<SiteLayers map={map as never} site={site()} buildings={[]} threeD contours={false} />)
    expect(map.terrain.at(-1)).toEqual({ source: 'site-dem-terrain', exaggeration: 1 })
    expect(visible(map, SITE_LAYER.slabs)).toBe(true)
    rerender(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours={false} />)
    expect(map.terrain.at(-1)).toBeNull()
  })

  it('contours toggle adds and removes the contour layer', () => {
    const map = fakeMap()
    const { rerender } = render(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours />)
    expect(ids(map)).toContain(SITE_LAYER.contours)
    rerender(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours={false} />)
    expect(ids(map)).not.toContain(SITE_LAYER.contours)
  })

  it('structures layer gets one mesh with every structure', () => {
    const map = fakeMap()
    render(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours={false} />)
    expect(map.layers.find((l) => l.id === SITE_LAYER.structures)?.implementation?.vertexCount()).toBeGreaterThan(0)
  })

  it('without site.terrain: flat ground, still campus only (no DEM, 3D stays flat)', () => {
    const map = fakeMap()
    render(<SiteLayers map={map as never} site={site(false)} buildings={[]} threeD contours={false} />)
    expect(ids(map)).toContain(SITE_LAYER.ground)
    expect(ids(map)).not.toContain(SITE_LAYER.hillshade)
    expect([...map.sources.keys()].some((id) => id.startsWith('site-dem'))).toBe(false)
    expect(map.terrain.filter((t) => t !== null)).toEqual([])
  })

  it('the route ribbon is drawn only in 3D, on the surface', () => {
    const map = fakeMap()
    const route = [ll(-10, 0), ll(10, 0)]
    const { rerender } = render(<SiteLayers map={map as never} site={site()} buildings={[]} threeD={false} contours={false} routePath={route} />)
    const ribbon = () => map.layers.find((l) => l.id === SITE_LAYER.route)?.implementation?.vertexCount() ?? 0
    expect(ribbon()).toBe(0)
    act(() => { rerender(<SiteLayers map={map as never} site={site()} buildings={[]} threeD contours={false} routePath={route} />) })
    expect(ribbon()).toBeGreaterThan(0)
  })
})
