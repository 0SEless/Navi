type LatLng = { lat: number; lng: number }

export interface CampusCameraLimits {
  maxBounds: [[number, number], [number, number]]
  minZoom: number
  maxZoom: number
  maxPitch: number
}

export const MAX_ZOOM = 21
export const MAX_PITCH = 80

/** Web-Mercator y as a fraction of the world (0 at the top). */
function mercatorY(lat: number): number {
  return (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
}

/**
 * Where the camera may go so you never get lost (section 4): the campus box plus half its size on every
 * side; zoom out to one level beyond the whole campus in this window; zoom in to 21 (a few metres
 * across); tilt to 80°. null without a boundary.
 */
export function campusCameraLimits(boundary: LatLng[], size: { width: number; height: number }): CampusCameraLimits | null {
  if (boundary.length < 3) return null
  const lngs = boundary.map((p) => p.lng)
  const lats = boundary.map((p) => p.lat)
  const w = Math.min(...lngs)
  const e = Math.max(...lngs)
  const s = Math.min(...lats)
  const n = Math.max(...lats)
  const dLng = e - w
  const dLat = n - s
  const maxBounds: [[number, number], [number, number]] = [[w - dLng / 2, s - dLat / 2], [e + dLng / 2, n + dLat / 2]]
  // MapLibre's world is 512 px wide at zoom 0.
  const fitX = Math.log2(size.width / (((dLng || 1e-6) / 360) * 512))
  const fitY = Math.log2(size.height / ((mercatorY(s) - mercatorY(n) || 1e-9) * 512))
  return { maxBounds, minZoom: Math.min(fitX, fitY) - 1, maxZoom: MAX_ZOOM, maxPitch: MAX_PITCH }
}
