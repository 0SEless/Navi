import { offsetRoadLine, type SiteRoadSurface } from '@navi/core'

/** Road look (section 4, shared by Studio and NAVI Web): dark asphalt roads, light paving paths. */
export const ROAD_COLOR = '#4b4f55'
export const PATH_COLOR = '#ddd6c8'

/** Roads this wide or wider have two lanes: a dashed centre line. */
export const TWO_LANE_WIDTH_M = 5
/** Edge lines sit this far inside the road's edge. */
const EDGE_INSET_M = 0.3

/**
 * Road markings (section 4): white edge lines along both sides of every road, and a dashed centre line
 * on two-lane roads (≥ 5 m). Paths (`pedestrian`) have none. Lines drape on the terrain like the surface.
 */
export function roadMarkings(roads: SiteRoadSurface[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const line = (roadId: string, kind: 'edge' | 'centre', points: Array<{ lat: number; lng: number }>) => {
    features.push({ type: 'Feature', properties: { roadId, kind }, geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) } })
  }
  for (const road of roads) {
    if (road.type === 'pedestrian' || road.polyline.length < 2 || !(road.width > 0)) continue
    const inset = Math.max(0.2, road.width / 2 - EDGE_INSET_M)
    line(road.id, 'edge', offsetRoadLine(road, inset))
    line(road.id, 'edge', offsetRoadLine(road, -inset))
    if (road.width >= TWO_LANE_WIDTH_M) line(road.id, 'centre', road.polyline)
  }
  return { type: 'FeatureCollection', features }
}
