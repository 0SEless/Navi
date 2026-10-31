import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { TerrainArea } from '@navi/core'

export type TerrainFeature = Feature<Polygon, {
  id: string
  name: string
  color: string
  elevationMeters: number
  datumName: string
}>

export interface TerrainMapBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/** Union the graph extent with authored world-coordinate terrain for map framing. */
export function terrainAwareMapBounds(
  graphBounds: TerrainMapBounds | null,
  areas: readonly TerrainArea[],
): TerrainMapBounds | null {
  let minLat = graphBounds?.minLat ?? Infinity
  let maxLat = graphBounds?.maxLat ?? -Infinity
  let minLng = graphBounds?.minLng ?? Infinity
  let maxLng = graphBounds?.maxLng ?? -Infinity
  let hasPoint = graphBounds !== null

  for (const area of areas) {
    for (const point of area.points) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
      minLat = Math.min(minLat, point.lat)
      maxLat = Math.max(maxLat, point.lat)
      minLng = Math.min(minLng, point.lng)
      maxLng = Math.max(maxLng, point.lng)
      hasPoint = true
    }
  }

  return hasPoint ? { minLat, maxLat, minLng, maxLng } : null
}

/** Project authored vertices without rounding. Only the GeoJSON ring is closed. */
export function terrainAreasToGeoJSON(
  areas: readonly TerrainArea[],
  datumName: string,
): FeatureCollection<Polygon, TerrainFeature['properties']> {
  const features: TerrainFeature[] = areas
    .filter((area) => area.points.length >= 3)
    .map((area) => {
      const ring = area.points.map((point) => [point.lng, point.lat] as [number, number])
      if (ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1]) ring.pop()
      let twiceSignedArea = 0
      for (let index = 0; index < ring.length; index++) {
        const current = ring[index]!
        const next = ring[(index + 1) % ring.length]!
        twiceSignedArea += current[0] * next[1] - next[0] * current[1]
      }
      // GeoJSON outer rings use counter-clockwise winding. Reverse this render
      // copy only; the authored CampusDocument keeps its original point order.
      if (twiceSignedArea < 0) ring.reverse()
      ring.push([...ring[0]] as [number, number])
      return {
        type: 'Feature' as const,
        id: area.id,
        properties: {
          id: area.id,
          name: area.name,
          color: area.color,
          elevationMeters: area.elevationMeters,
          datumName,
        },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      }
    })
  return { type: 'FeatureCollection', features }
}
