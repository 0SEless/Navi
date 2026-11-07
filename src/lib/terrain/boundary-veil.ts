type LatLng = { lat: number; lng: number }

/**
 * The outside of the campus as one polygon (the whole world with the boundary as its hole), for a light
 * veil: you always see where the campus ends, and nothing outside is hidden (section 4). null without a
 * boundary.
 */
export function boundaryVeil(boundary: LatLng[]): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (boundary.length < 3) return null
  const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
  const ring = boundary.map((p): [number, number] => [p.lng, p.lat])
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, closed] } }
}
