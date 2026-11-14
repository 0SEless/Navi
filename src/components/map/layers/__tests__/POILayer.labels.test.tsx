import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { POILayer } from '../POILayer'

afterEach(cleanup)

describe('POI names', () => {
  it('draws each POI\'s name next to its marker', () => {
    const layers: Array<{ id: string; type: string; layout?: Record<string, unknown> }> = []
    const sources = new Map<string, unknown>()
    const map = {
      isStyleLoaded: () => true, on: () => {}, off: () => {},
      getSource: (id: string) => sources.get(id) ? { setData: () => {} } : undefined,
      addSource: (id: string, spec: unknown) => { sources.set(id, spec) },
      getLayer: (id: string) => layers.find((l) => l.id === id),
      addLayer: (layer: { id: string; type: string; layout?: Record<string, unknown> }) => { layers.push(layer) },
      removeLayer: () => {}, removeSource: () => {}, triggerRepaint: () => {},
    }
    render(<POILayer map={map as never} pois={[]} />)
    const label = layers.find((l) => l.type === 'symbol')
    expect(label?.layout?.['text-field']).toEqual(['get', 'name'])
  })
})

describe('POI shapes', () => {
  const ring = [{ lat: 11, lng: 122 }, { lat: 11, lng: 122.0001 }, { lat: 11.0001, lng: 122.0001 }]
  const base = { buildingId: '', floor: 0, position: { lat: 11, lng: 122 } }
  it('draws each shaped POI as its own shape, with its colour and (2.5D) height', async () => {
    const { buildPoiShapesGeoJSON } = await import('../POILayer')
    const fc = buildPoiShapesGeoJSON([
      { ...base, id: 'court', name: 'Court', shape: ring, appearance: { mode: '2.5d', color: '#0EA5E9', height: 2.5 } },
      { ...base, id: 'lawn', name: 'Lawn', shape: ring, appearance: { mode: '2d' } },
      { ...base, id: 'hidden', name: 'Tambayan', shape: ring, appearance: { mode: '2d' }, showOnMap: false },
      { ...base, id: 'gate', name: 'Gate' },
    ])
    expect(fc.features.map((f) => f.properties.id)).toEqual(['court', 'lawn'])
    expect(fc.features[0].properties).toMatchObject({ mode: '2.5d', color: '#0EA5E9', height: 2.5 })
    expect(fc.features[0].geometry.coordinates[0]).toHaveLength(4)
  })

  it('keeps the dot only for POIs without a shape; every POI keeps its name', async () => {
    const { buildPoiGeoJSON } = await import('../POILayer')
    const fc = buildPoiGeoJSON([{ ...base, id: 'lawn', name: 'Lawn', shape: ring, appearance: { mode: '2d' } }, { ...base, id: 'gate', name: 'Gate' }])
    expect(fc.features.map((f) => [f.properties.id, f.properties.marker])).toEqual([['lawn', false], ['gate', true]])
  })
})
