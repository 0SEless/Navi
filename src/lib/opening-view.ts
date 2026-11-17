/**
 * The map's opening view (owner 2026-11-18): entrance-first and in portrait, as phones are held. The camera looks from
 * the campus's Entrance Gate (or Main Gate) toward the middle of the campus, so the gate sits at the bottom of the
 * screen and the campus runs up from it. Without a gate the map opens north-up, as before.
 */
type LatLng = { lat: number; lng: number }

const GATE_NAME = /\b(entrance|main)\s+gate\b/i

/** Compass bearing (degrees, 0 = north, clockwise) to open the campus map with, or undefined for north-up. */
export function openingBearing(pois: ReadonlyArray<unknown>, boundary: readonly LatLng[]): number | undefined {
  if (boundary.length === 0) return undefined
  const gate = pois.find((p): p is { label: string; position: LatLng } => {
    const c = p as { label?: unknown; position?: { lat?: unknown; lng?: unknown } }
    return typeof c.label === 'string' && GATE_NAME.test(c.label) && typeof c.position?.lat === 'number' && typeof c.position?.lng === 'number'
  })
  if (!gate) return undefined
  const centre = { lat: boundary.reduce((n, p) => n + p.lat, 0) / boundary.length, lng: boundary.reduce((n, p) => n + p.lng, 0) / boundary.length }
  const dx = (centre.lng - gate.position.lng) * Math.cos(((centre.lat + gate.position.lat) / 2) * Math.PI / 180)
  const dy = centre.lat - gate.position.lat
  if (Math.hypot(dx, dy) < 1e-7) return undefined
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
}
