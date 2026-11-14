/**
 * On 3D terrain MapLibre lifts every fill-extrusion by the ground under that piece's own centre. A building's
 * walls, frames and stairs are many small pieces, so on a slope each one ends up at a different height
 * (uneven walls, short walls poking out downhill). This puts the ground back: every piece's base and top are
 * shifted by (floor − ground at its centre), so all of them stand on the building's one flat floor. Where the
 * floor is below the ground (a building cut into the hill) the lower part is simply buried.
 */
type Ground = (p: { lat: number; lng: number }) => number

/** The average of a polygon's corners (closing point excluded) — the point MapLibre samples the ground at. */
function centre(rings: GeoJSON.Position[][]): { lat: number; lng: number } | null {
  let lng = 0, lat = 0, n = 0
  for (const ring of rings) {
    const last = ring.length - 1
    const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1]
    for (let i = 0; i < (closed ? last : ring.length); i++) { lng += ring[i][0]; lat += ring[i][1]; n++ }
  }
  return n ? { lat: lat / n, lng: lng / n } : null
}

function levelled(source: GeoJSON.Feature, rings: GeoJSON.Position[][], ground: Ground, floorM: number): GeoJSON.Feature {
  const at = centre(rings)
  const props = source.properties ?? {}
  if (!at) return source
  const shift = floorM - ground(at)
  return {
    ...source,
    geometry: { type: 'Polygon', coordinates: rings },
    properties: { ...props, base: Number(props.base) + shift, height: Number(props.height) + shift },
  }
}

export function levelOnGround(fc: GeoJSON.FeatureCollection, ground: Ground, floorM: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const feature of fc.features) {
    const props = feature.properties
    const sized = props && Number.isFinite(Number(props.base)) && Number.isFinite(Number(props.height))
    if (!sized || !feature.geometry) { features.push(feature); continue }
    if (feature.geometry.type === 'Polygon') features.push(levelled(feature, feature.geometry.coordinates, ground, floorM))
    else if (feature.geometry.type === 'MultiPolygon') for (const rings of feature.geometry.coordinates) features.push(levelled(feature, rings, ground, floorM))
    else features.push(feature)
  }
  return { ...fc, features }
}
