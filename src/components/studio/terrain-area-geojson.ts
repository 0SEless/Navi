import type { TerrainArea } from '@navi/core'
import type { FeatureCollection, Polygon } from 'geojson'

export function terrainAreasToGeoJSON(
  areas: readonly TerrainArea[] | undefined,
  selectedId: string | null,
  conflictIds: ReadonlySet<string> = new Set(),
): FeatureCollection<Polygon, { id: string; name: string; color: string; elevationMeters: number; selected: boolean; conflict: boolean }> {
  return {
    type: 'FeatureCollection',
    features: (areas ?? []).filter((area) => area.points.length >= 3).map((area) => {
      const first = area.points[0]
      const ring = area.points.map((point) => [point.lng, point.lat] as [number, number])
      const last = ring[ring.length - 1]
      if (last[0] !== first.lng || last[1] !== first.lat) ring.push([first.lng, first.lat])
      return {
        type: 'Feature',
        id: area.id,
        properties: {
          id: area.id,
          name: area.name,
          color: area.color,
          elevationMeters: area.elevationMeters,
          selected: area.id === selectedId,
          conflict: conflictIds.has(area.id),
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      }
    }),
  }
}
