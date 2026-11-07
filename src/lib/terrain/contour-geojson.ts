import { contourSegments, toLatLng, type Rect, type TerrainGrid } from '@navi/core'

/** Contour lines every 1 m (major every 5 m) over `bbox` (local metres), sampled every 2 m. */
export function contourGeoJson(heightAt: (x: number, y: number) => number, grid: TerrainGrid, bbox: Rect): GeoJSON.FeatureCollection {
  const levels = contourSegments(heightAt, bbox, { step: 1, cell: 2 })
  return {
    type: 'FeatureCollection',
    features: levels.flatMap((level) => level.segments.map(([a, b]) => {
      const pa = toLatLng(grid, a)
      const pb = toLatLng(grid, b)
      return {
        type: 'Feature' as const,
        properties: { elevation: level.elevationM, major: Math.abs(level.elevationM % 5) < 1e-6 },
        geometry: { type: 'LineString' as const, coordinates: [[pa.lng, pa.lat], [pb.lng, pb.lat]] },
      }
    })),
  }
}
