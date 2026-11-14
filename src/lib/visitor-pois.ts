import type { PoiRenderData } from '@/components/map/NavigationRenderModel'

/** An authored POI as published to NAVI Web. */
export interface PublishedPoi {
  id: string
  label?: string
  name?: string
  category?: string
  position: { lat: number; lng: number }
  buildingId?: string
  floor?: number
  visibility?: { showOnMap?: boolean; searchable?: boolean }
  appearance?: { mode?: string; color?: string; height?: number }
  geometry?:
    | { type: 'point'; position: { lat: number; lng: number } }
    | { type: 'circle'; center: { lat: number; lng: number }; radius: number }
    | { type: 'rectangle' | 'polygon'; points: Array<{ lat: number; lng: number }> }
    | { type: string }
}

const METRES_PER_DEGREE_LAT = 110540

/** The POI's ring in world coordinates (circles as 32 sides), or null for a point. */
function shapeRing(geometry: PublishedPoi['geometry']): Array<{ lat: number; lng: number }> | null {
  if (!geometry) return null
  if (geometry.type === 'circle' && 'center' in geometry && geometry.radius > 0) {
    const { center, radius } = geometry
    const perLng = 111320 * Math.cos((center.lat * Math.PI) / 180)
    return Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2
      return { lat: center.lat + (Math.sin(a) * radius) / METRES_PER_DEGREE_LAT, lng: center.lng + (Math.cos(a) * radius) / perLng }
    })
  }
  if ((geometry.type === 'rectangle' || geometry.type === 'polygon') && 'points' in geometry && geometry.points.length >= 3) return geometry.points
  return null
}

/** The authored look; absent = a shape is drawn flat (2D), a point is a marker. */
function lookOf(poi: PublishedPoi, ring: unknown): PoiRenderData['appearance'] {
  const mode = poi.appearance?.mode === 'marker' || poi.appearance?.mode === '2d' || poi.appearance?.mode === '2.5d' ? poi.appearance.mode : ring ? '2d' : 'marker'
  return {
    mode,
    ...(poi.appearance?.color ? { color: poi.appearance.color } : {}),
    ...(mode === '2.5d' ? { height: poi.appearance?.height && poi.appearance.height > 0 ? poi.appearance.height : 2.5 } : {}),
  }
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/**
 * The POIs the visitor map shows: outdoor ones always; ones inside a building only while that building is open,
 * on the floor shown. A POI the owner hid (show on map: off) is kept but marked hidden, so it stays off the map
 * while still searchable (a search can reveal it).
 */
export function visitorPois(pois: readonly PublishedPoi[] | undefined, indoor: { active: boolean; buildingId?: string }, floor: number): PoiRenderData[] {
  const out: PoiRenderData[] = []
  for (const poi of pois ?? []) {
    if (!poi.position) continue
    const inside = Boolean(poi.buildingId)
    if (inside && !(indoor.active && indoor.buildingId === poi.buildingId && (poi.floor ?? 0) === floor)) continue
    const ring = shapeRing(poi.geometry)
    const appearance = lookOf(poi, ring)
    out.push({
      ...(ring && appearance && appearance.mode !== 'marker' ? { shape: ring } : {}),
      ...(appearance ? { appearance } : {}),
      id: poi.id,
      name: poi.label || poi.name || (poi.category ? titleCase(poi.category) : 'Place'),
      buildingId: poi.buildingId ?? '',
      floor: poi.floor ?? 0,
      position: poi.position,
      ...(poi.category ? { category: poi.category } : {}),
      ...(poi.visibility?.showOnMap === false ? { showOnMap: false } : {}),
    })
  }
  return out
}
