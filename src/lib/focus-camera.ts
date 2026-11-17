/**
 * Where the camera goes when a visitor taps a building or picks a room: the shape framed, tilted for the 2.5D
 * view, in the part of the screen above the details sheet (it covers the lower ~40% on a phone).
 * With a known entrance, the camera faces the building's front (owner 2026-11-18): it looks from the entrance toward
 * the building, so the entrance side is the one turned toward the viewer.
 */
type LatLng = { lat: number; lng: number }

export interface FocusCamera {
  bounds: [[number, number], [number, number]]
  options: { padding: { top: number; bottom: number; left: number; right: number }; pitch: number; maxZoom: number; duration: number; bearing?: number }
}

/** Compass bearing (degrees, 0 = north, clockwise) from a to b. */
function bearingBetween(a: LatLng, b: LatLng): number {
  const dx = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  const dy = b.lat - a.lat
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
}

export function focusCamera(shape: readonly LatLng[], viewport: { width: number; height: number }, kind: 'building' | 'room', front?: LatLng | null): FocusCamera | null {
  if (shape.length === 0) return null
  const lngs = shape.map((p) => p.lng)
  const lats = shape.map((p) => p.lat)
  const side = Math.round(Math.min(48, viewport.width * 0.1))
  const centre = { lat: lats.reduce((n, v) => n + v, 0) / lats.length, lng: lngs.reduce((n, v) => n + v, 0) / lngs.length }
  // Only when the entrance is clearly to one side of the shape's middle (not on top of it).
  const facing = front && Math.hypot(front.lat - centre.lat, front.lng - centre.lng) > 1e-6 ? bearingBetween(front, centre) : undefined
  return {
    bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    options: {
      // Room for the compact building card and the tab bar below it (owner 2026-11-18: the card is about 17%).
      padding: { top: 90, bottom: Math.round(viewport.height * 0.26), left: side, right: side + 40 },
      pitch: 50,
      maxZoom: kind === 'room' ? 20.8 : 20,
      duration: 900,
      ...(facing === undefined ? {} : { bearing: facing }),
    },
  }
}

/** A building's front: its entrance called main or front, else the one on its lowest floor; null when it has none. */
export function buildingFront(nodes: ReadonlyArray<{ type: string; buildingId?: string; floor: number; label?: string; position: LatLng }>, buildingId: string): LatLng | null {
  const entrances = nodes.filter((n) => n.buildingId === buildingId && (n.type === 'entrance' || n.type === 'building_entrance'))
  if (entrances.length === 0) return null
  const named = entrances.find((n) => /\b(main|front)\b/i.test(n.label ?? ''))
  const lowest = [...entrances].sort((a, b) => a.floor - b.floor)[0]
  const pick = named ?? lowest
  return { lat: pick.position.lat, lng: pick.position.lng }
}
