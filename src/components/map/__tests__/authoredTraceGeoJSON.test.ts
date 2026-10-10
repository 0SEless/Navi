import { describe, expect, it } from 'vitest'
import { tracesToGeoJSON } from '../authoredTraceGeoJSON'
import type { TracePath } from '@/types/nav-types'

describe('authored public road GeoJSON', () => {
  it('projects visible authored traces to plain coordinates and preserves navigation metadata', () => {
    const trace: TracePath = {
      id: 'road-main',
      name: 'Main walk',
      floor: 0,
      type: 'arterial',
      displayMode: 'visible',
      points: [{ lat: 10, lng: 20 }, { lat: 10.001, lng: 20.001 }],
      metadata: { source: 'studio' },
    }

    const collection = tracesToGeoJSON([trace])

    expect(collection).toEqual({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'road-main',
        properties: expect.objectContaining({
          id: 'road-main',
          road_type: 'arterial',
          displayMode: 'visible',
          metadata: { source: 'studio' },
        }),
        geometry: {
          type: 'LineString',
          coordinates: [[20, 10], [20.001, 10.001]],
        },
      }],
    })
    expect(Object.getPrototypeOf(collection)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(collection.features[0].geometry)).toBe(Object.prototype)
  })

  it('omits navigation-only, duplicate, malformed, and too-short traces', () => {
    const base: TracePath = {
      id: 'road-1', floor: 0, type: 'arterial',
      points: [{ lat: 10, lng: 20 }, { lat: 10.001, lng: 20.001 }],
    }

    const collection = tracesToGeoJSON([
      base,
      { ...base, name: 'duplicate' },
      { ...base, id: 'navigation-only', displayMode: 'navigation-only' },
      { ...base, id: 'malformed', points: [{ lat: 91, lng: 20 }, { lat: 10, lng: 20 }] },
      { ...base, id: 'short', points: [{ lat: 10, lng: 20 }] },
    ])

    expect(collection.features.map((feature) => feature.id)).toEqual(['road-1'])
  })
})
