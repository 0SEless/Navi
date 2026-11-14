/**
 * Zooming in on a building opens its floor (2.5D when tilted, floor plan when flat); zooming back out closes it.
 * Two zoom levels apart so the view does not flicker at the edge. Zoomed in over a different building, that one
 * opens (even after a tap). A building the visitor tapped is never closed by zooming out.
 */
export const AUTO_INDOOR_ENTER_ZOOM = 18.5
export const AUTO_INDOOR_EXIT_ZOOM = 17.8

type LatLng = { lat: number; lng: number }

export interface AutoIndoorInput {
  buildings: ReadonlyArray<{ id: string; footprint: readonly LatLng[] }>
  center: LatLng
  zoom: number
  /** The building currently open, and whether zooming opened it (auto) or the visitor tapped it. */
  indoor: { buildingId: string; auto: boolean } | null
}

export type AutoIndoorDecision = { enter: string } | { exit: true } | null

function contains(ring: readonly LatLng[], point: LatLng): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.lat > point.lat) !== (b.lat > point.lat)
      && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng) inside = !inside
  }
  return inside
}

export function autoIndoorDecision({ buildings, center, zoom, indoor }: AutoIndoorInput): AutoIndoorDecision {
  // Zooming out closes only a building zooming opened; a tapped one stays until the visitor closes it.
  if (indoor && indoor.auto && zoom < AUTO_INDOOR_EXIT_ZOOM) return { exit: true }
  if (zoom < AUTO_INDOOR_ENTER_ZOOM) return null
  const under = buildings.find((b) => b.footprint.length >= 3 && contains(b.footprint, center))
  if (!under || under.id === indoor?.buildingId) return null
  return { enter: under.id }
}
