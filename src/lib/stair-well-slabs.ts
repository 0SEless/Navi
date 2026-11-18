import { difference, featureCollection, polygon } from '@turf/turf'

function closeRing(ring: number[][]): number[][] {
  const first = ring[0], last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

/** Genuine subtraction, including crossing and tangent rings with no contained vertices. */
export function cutStairWells(slab: number[][][], wells: readonly number[][][]): number[][][][] {
  slab = slab.map(closeRing)
  const cuts = wells.filter(well => well.length >= 3 && well.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])))
  if (!cuts.length) return [slab]
  const result = difference(featureCollection([polygon(slab), ...cuts.map(well => polygon([closeRing(well)]))]))
  if (!result) return []
  return result.geometry.type === 'Polygon' ? [result.geometry.coordinates] : result.geometry.coordinates
}

export function cutStairWellsFromFeatures(features: GeoJSON.Feature[], wells: readonly number[][][]): GeoJSON.Feature[] {
  if (!wells.length) return features
  return features.flatMap(feature => feature.geometry.type === 'Polygon'
    ? cutStairWells(feature.geometry.coordinates, wells).map((coordinates, index) => ({
      ...feature, ...(feature.id === undefined || index === 0 ? {} : { id: `${feature.id}:slab:${index}` }),
      geometry: { type: 'Polygon' as const, coordinates },
    }))
    : [feature])
}
