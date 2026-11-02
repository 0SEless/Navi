import { describe, expect, it } from 'vitest'
import { createTerrainSampler, toLatLng, type CampusDocument } from '@navi/core'
import { attachRoadSurfaces, ROAD_SURFACE_LAYER, roadSurfaceData } from '../layers/RoadSurfaceLayer'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function doc(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'Test', zeroMeaning: 'Sea level' }, grid, colorRange: { minM: 0, maxM: 40 } },
    roads: [
      { id: 'r1', polyline: { points: [ll(0, 0), ll(80, 0)] }, width: 6, type: 'connector', routing: { startElevationMeters: 9, endElevationMeters: 11 } },
      { id: 'r2', polyline: { points: [ll(0, 20), ll(80, 20)] }, width: 3, type: 'pathway', heightMode: 'typed', routing: { startElevationMeters: 9, endElevationMeters: 11 } },
    ],
  } as unknown as CampusDocument
}

function fakeMap() {
  const layers: Array<{ id: string; before?: string; layout?: Record<string, unknown> }> = [{ id: 'terrain-roads' }]
  const sources = new Map<string, { data: unknown; setData(d: unknown): void }>()
  return {
    layers,
    sources,
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, spec: { data: unknown }) => {
      const source = { data: spec.data, setData(d: unknown) { source.data = d } }
      sources.set(id, source)
    },
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (layer: { id: string; layout?: Record<string, unknown> }, before?: string) => { layers.splice(layers.findIndex((l) => l.id === before), 0, { ...layer, before }) },
    setLayoutProperty: (id: string, key: string, value: unknown) => { const l = layers.find((x) => x.id === id)!; l.layout = { ...l.layout, [key]: value } },
  }
}

describe('road surfaces in the terrain workspace', () => {
  it('one polygon per road; Follow ground reads the ground, Typed keeps its typed heights', () => {
    const d = doc()
    const fc = roadSurfaceData(d, createTerrainSampler(d))
    expect(fc.features.map((f) => f.properties?.id)).toEqual(['r1', 'r2'])
    expect(fc.features[0].properties).toMatchObject({ startHeightM: 0, endHeightM: 0 })
    expect(fc.features[1].properties).toMatchObject({ startHeightM: 9, endHeightM: 11 })
  })

  it('no ground yet → no surfaces', () => {
    expect(roadSurfaceData(doc(), null).features).toEqual([])
  })

  it('the fill sits under the road lines and follows the Roads layer switch', () => {
    const map = fakeMap()
    const d = doc()
    attachRoadSurfaces(map as never, roadSurfaceData(d, createTerrainSampler(d)), true)
    expect(map.layers.map((l) => l.id)).toEqual([ROAD_SURFACE_LAYER, 'terrain-roads'])
    attachRoadSurfaces(map as never, roadSurfaceData(d, createTerrainSampler(d)), false)
    expect(map.layers.filter((l) => l.id === ROAD_SURFACE_LAYER)).toHaveLength(1)
    expect(map.layers[0].layout?.visibility).toBe('none')
  })
})
