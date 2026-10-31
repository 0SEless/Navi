import { describe, expect, it } from 'vitest'
import { terrainAreasToGeoJSON } from '../terrain-area-geojson'

describe('terrainAreasToGeoJSON', () => {
  it('keeps authored point order, closes only the render ring, and exposes datum-relative elevation properties', () => {
    const points = [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }, { lat: 2, lng: 3 }]
    const result = terrainAreasToGeoJSON([{ id: 'stable-1', name: 'North lawn', points, color: '#22aa66', elevationMeters: 3.25 }], 'stable-1')

    expect(result.features[0]).toMatchObject({
      id: 'stable-1',
      properties: { id: 'stable-1', name: 'North lawn', color: '#22aa66', elevationMeters: 3.25, selected: true },
      geometry: { type: 'Polygon', coordinates: [[[2, 1], [3, 1], [3, 2], [2, 1]]] },
    })
  })
})
