/**
 * Where the camera goes when a visitor taps a building or picks a room: the shape framed, tilted for the 2.5D
 * view, in the part of the screen above the details sheet (it covers the lower ~40% on a phone).
 */
type LatLng = { lat: number; lng: number }

export interface FocusCamera {
  bounds: [[number, number], [number, number]]
  options: { padding: { top: number; bottom: number; left: number; right: number }; pitch: number; maxZoom: number; duration: number }
}

export function focusCamera(shape: readonly LatLng[], viewport: { width: number; height: number }, kind: 'building' | 'room'): FocusCamera | null {
  if (shape.length === 0) return null
  const lngs = shape.map((p) => p.lng)
  const lats = shape.map((p) => p.lat)
  const side = Math.round(Math.min(48, viewport.width * 0.1))
  return {
    bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    options: {
      padding: { top: 90, bottom: Math.round(viewport.height * 0.42), left: side, right: side + 40 },
      pitch: 50,
      maxZoom: kind === 'room' ? 20.8 : 20,
      duration: 900,
    },
  }
}
