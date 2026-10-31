import { describe, expect, it } from 'vitest'
import type { TerrainArea } from '@navi/core'
import { terrainAreasToGeoJSON, terrainAwareMapBounds } from './terrain-layer-geojson'

const areas: TerrainArea[] = [{
  id: 'terrain-1',
  name: 'North lawn',
  color: '#22aa66',
  elevationMeters: 3.25,
  points: [
    { lat: 14.601480195049547, lng: 121.0529741824862 },
    { lat: 14.601554786948284, lng: 121.05364864506254 },
    { lat: 14.600892782960344, lng: 121.05364864506254 },
  ],
}]

describe('terrainAreasToGeoJSON', () => {
  it('keeps authored coordinates exact and emits a GeoJSON counter-clockwise render ring', () => {
    const result = terrainAreasToGeoJSON(areas, 'Synthetic campus datum')
    expect(result.features).toHaveLength(1)
    expect(result.features[0]).toMatchObject({
      id: 'terrain-1',
      properties: {
        id: 'terrain-1', name: 'North lawn', color: '#22aa66', elevationMeters: 3.25,
        datumName: 'Synthetic campus datum',
      },
    })
    const polygon = result.features[0].geometry
    expect(polygon.type).toBe('Polygon')
    if (polygon.type !== 'Polygon') throw new Error('Expected terrain polygon geometry')
    expect(polygon.coordinates[0]).toEqual([
      [121.05364864506254, 14.600892782960344],
      [121.05364864506254, 14.601554786948284],
      [121.0529741824862, 14.601480195049547],
      [121.05364864506254, 14.600892782960344],
    ])
    expect(areas[0]?.points).toEqual([
      { lat: 14.601480195049547, lng: 121.0529741824862 },
      { lat: 14.601554786948284, lng: 121.05364864506254 },
      { lat: 14.600892782960344, lng: 121.05364864506254 },
    ])
  })

  it('produces deterministic feature order and a valid empty source for legacy bundles', () => {
    expect(terrainAreasToGeoJSON(areas, 'D').features).toEqual(terrainAreasToGeoJSON(areas, 'D').features)
    expect(terrainAreasToGeoJSON([], '').features).toEqual([])
  })

  it('expands the runtime view bounds to include terrain outside the navigation graph bounds', () => {
    expect(terrainAwareMapBounds(
      { minLat: 14.6004, maxLat: 14.6005, minLng: 121.05, maxLng: 121.0505 },
      areas,
    )).toEqual({ minLat: 14.6004, maxLat: 14.601554786948284, minLng: 121.05, maxLng: 121.05364864506254 })
  })

  it('keeps the existing graph extent when terrain is absent and unions both extents when they overlap', () => {
    const graphBounds = { minLat: 14.6, maxLat: 14.602, minLng: 121.05, maxLng: 121.054 }
    expect(terrainAwareMapBounds(graphBounds, [])).toEqual(graphBounds)
    expect(terrainAwareMapBounds(graphBounds, areas)).toEqual(graphBounds)
    expect(terrainAwareMapBounds(null, [])).toBeNull()
  })
})
